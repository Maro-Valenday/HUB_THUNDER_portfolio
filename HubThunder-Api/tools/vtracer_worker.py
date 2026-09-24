#!/usr/bin/env python3
"""Hub Thunder's VTracer pipeline, independent of reference/editor projects."""
import argparse
import io
import json
import math
import re
import uuid
import xml.etree.ElementTree as ET
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageOps, UnidentifiedImageError
import vtracer


def distance_to_segment(point, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    length2 = dx * dx + dy * dy
    t = max(0, min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length2)) if length2 else 0
    return math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy)


def rdp(points, epsilon):
    # Iterative finite-segment distance preserves reversals without recursion limits.
    if len(points) < 3:
        return points[:]
    keep, pending = {0, len(points) - 1}, [(0, len(points) - 1)]
    while pending:
        first, last = pending.pop()
        maximum, split = 0, first
        for index in range(first + 1, last):
            distance = distance_to_segment(points[index], points[first], points[last])
            if distance > maximum:
                maximum, split = distance, index
        if maximum > epsilon:
            keep.add(split)
            pending.extend(((first, split), (split, last)))
    return [points[index] for index in sorted(keep)]


def area(points):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(points, points[1:] + points[:1])) / 2


def crossing(points):
    edges = sorted((min(a[0], b[0]), max(a[0], b[0]), i, a, b)
                   for i, (a, b) in enumerate(zip(points, points[1:] + points[:1])))
    active = []
    def side(a, b, c):
        return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    for left, right, index, a, b in edges:
        active = [edge for edge in active if edge[0] >= left]
        for _, other, c, d in active:
            if abs(index - other) in (1, len(points) - 1):
                continue
            if side(a, b, c) * side(a, b, d) < -1e-12 and side(c, d, a) * side(c, d, b) < -1e-12:
                return True
        active.append((right, index, a, b))
    return False


def optimize_ring(points, epsilon):
    unique = []
    for point in points:
        if not unique or math.dist(point, unique[-1]) > 1e-7:
            unique.append(point)
    if len(unique) > 1 and math.dist(unique[0], unique[-1]) < 1e-7:
        unique.pop()
    if len(unique) < 4:
        return unique
    # Split a closed ring across its diameter, never across a zero-length chord.
    start = min(range(len(unique)), key=lambda i: unique[i])
    unique = unique[start:] + unique[:start]
    opposite = max(range(1, len(unique)), key=lambda i: math.dist(unique[0], unique[i]))
    original_area = area(unique)
    for attempt in range(5):
        tolerance = epsilon / (2 ** attempt)
        result = rdp(unique[:opposite + 1], tolerance)[:-1] + rdp(unique[opposite:] + unique[:1], tolerance)[:-1]
        if (len(result) >= 3 and area(result) * original_area > 0
                and abs(area(result) - original_area) <= max(.5, abs(original_area) * .025)
                and not crossing(result)):
            return result
    return unique


def ring_topology(rings):
    def contains(point, ring):
        x, y = point
        return sum((a[1] > y) != (b[1] > y)
                   and x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]
                   for a, b in zip(ring, ring[1:] + ring[:1])) % 2 == 1

    return {(i, j) for i, ring in enumerate(rings) for j, other in enumerate(rings)
            if i != j and contains(ring[0], other)}


def ring_intersections(rings):
    edges = sorted((min(a[0], b[0]), max(a[0], b[0]), index, a, b)
                   for index, ring in enumerate(rings)
                   for a, b in zip(ring, ring[1:] + ring[:1]) if a != b)
    active, pairs = [], set()
    def side(a, b, c):
        return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    for left, right, index, a, b in edges:
        active = [edge for edge in active if edge[0] >= left]
        for _, other, c, d in active:
            if index == other or max(a[1], b[1]) < min(c[1], d[1]) or max(c[1], d[1]) < min(a[1], b[1]):
                continue
            if side(a, b, c) * side(a, b, d) <= 0 and side(c, d, a) * side(c, d, b) <= 0:
                pairs.add((min(index, other), max(index, other)))
        active.append((right, index, a, b))
    return pairs


def optimize_group(rings, epsilon):
    # A valid ring alone is insufficient: a simplified exterior can cut across a hole.
    topology = ring_topology(rings)
    intersections = ring_intersections(rings) if len(rings) > 1 else set()
    for attempt in range(6):
        result = [optimize_ring(ring, epsilon / (2 ** attempt)) for ring in rings]
        if (all(len(ring) >= 3 for ring in result) and ring_topology(result) == topology
                and not (ring_intersections(result) - intersections)):
            return result
    return [ring[:-1] if ring[-1] == ring[0] else ring[:] for ring in rings]


def flatten_cubic(a, b, c, d, tolerance):
    result, pending = [], [(a, b, c, d, 0)]
    while pending:
        a, b, c, d, depth = pending.pop()
        if max(distance_to_segment(b, a, d), distance_to_segment(c, a, d)) <= tolerance or depth >= 16:
            result.append(d)
            continue
        ab, bc, cd = [tuple((x + y) / 2 for x, y in zip(p, q)) for p, q in ((a, b), (b, c), (c, d))]
        abc, bcd = [tuple((x + y) / 2 for x, y in zip(p, q)) for p, q in ((ab, bc), (bc, cd))]
        middle = tuple((x + y) / 2 for x, y in zip(abc, bcd))
        pending.extend(((middle, bcd, cd, d, depth + 1), (a, ab, abc, middle, depth + 1)))
    return result


def parse_svg(svg, tolerance, samples=12):
    """Read VTracer's M/L/C/Z dialect, preserving compound regions and closure."""
    groups, baselines, curve_count = [], [], 0
    for node in ET.fromstring(svg).iter():
        if node.tag.rsplit('}', 1)[-1] != 'path':
            continue
        transform = node.get('transform', '')
        translation = re.fullmatch(r'\s*translate\(\s*([-+\d.eE]+)[,\s]+([-+\d.eE]+)\s*\)\s*', transform)
        if transform and not translation:
            raise ValueError('Unsupported VTracer transform.')
        tx, ty = map(float, translation.groups()) if translation else (0., 0.)
        tokens = re.findall(r'[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?', node.get('d', ''))
        index, command, current, origin = 0, None, (0., 0.), (0., 0.)
        rings, dense_rings, points, dense = [], [], [], []
        def world(p):
            return p[0] + tx, p[1] + ty
        while index < len(tokens):
            if tokens[index].isalpha():
                command = tokens[index]
                index += 1
            if command in ('Z', 'z'):
                if points:
                    if points[-1] != points[0]:
                        points.append(points[0])
                    if dense[-1] != dense[0]:
                        dense.append(dense[0])
                    rings.append(points); dense_rings.append(dense)
                points, dense, current, command = [], [], origin, None
                continue
            if command not in ('M', 'm', 'L', 'l', 'C', 'c', 'H', 'h', 'V', 'v'):
                raise ValueError('Unsupported VTracer path command.')
            count = 6 if command.upper() == 'C' else 1 if command.upper() in ('H', 'V') else 2
            values = list(map(float, tokens[index:index + count]))
            index += count
            relative = command.islower()
            if command.upper() in ('H', 'V'):
                axis = 0 if command.upper() == 'H' else 1
                end = list(current)
                end[axis] = values[0] + (current[axis] if relative else 0)
                current = tuple(end)
                points.append(world(current)); dense.append(world(current))
            elif command.upper() == 'C':
                control = [(values[i] + (current[0] if relative else 0), values[i + 1] + (current[1] if relative else 0)) for i in (0, 2, 4)]
                b, c, end = control
                points.extend(world(p) for p in flatten_cubic(current, b, c, end, tolerance))
                for sample in range(1, samples + 1):
                    t, u = sample / samples, 1 - sample / samples
                    dense.append(world(tuple(u ** 3 * current[j] + 3 * u * u * t * b[j] + 3 * u * t * t * c[j] + t ** 3 * end[j] for j in (0, 1))))
                current = end
                curve_count += 1
            else:
                if command.upper() == 'M' and points:
                    raise ValueError('Unclosed VTracer contour.')
                current = (values[0] + (current[0] if relative else 0), values[1] + (current[1] if relative else 0))
                points.append(world(current)); dense.append(world(current))
                if command.upper() == 'M':
                    origin, command = current, 'l' if relative else 'L'
        if points:
            raise ValueError('Unclosed VTracer contour.')
        if rings:
            groups.append(rings); baselines.append(dense_rings)
    return groups, baselines, curve_count


def otsu(values):
    histogram = np.bincount(np.asarray(values, dtype=np.uint8).ravel(), minlength=256)
    if np.count_nonzero(histogram) < 2:
        return 128
    weights = np.cumsum(histogram).astype(float)
    means = np.cumsum(histogram * np.arange(256))
    denominator = weights * (weights[-1] - weights)
    score = np.divide((means[-1] * weights - means * weights[-1]) ** 2, denominator,
                      out=np.zeros(256), where=denominator > 0)
    return int(np.argmax(score))


def analyze_background(rgba):
    visible = rgba[:, :, 3] >= 128
    rgb = rgba[:, :, :3]
    border = np.concatenate((rgba[0], rgba[-1], rgba[:, 0], rgba[:, -1]))
    opaque_border = border[border[:, 3] >= 128, :3]
    excluded = ~visible
    info = {'background_method': 'alpha', 'background_pixels': int(excluded.sum())}
    if len(opaque_border) < len(border) * .6:
        return excluded, info
    color = np.median(opaque_border, axis=0)
    border_distance = np.max(np.abs(opaque_border.astype(float) - color), axis=1)
    if np.mean(border_distance <= 12) < .7:
        info['background_method'] = 'nonuniform-border'
        return excluded, info
    # Flood only edge-connected background. Enclosed light details stay in the object.
    similar = np.max(np.abs(rgb.astype(np.int16) - color.astype(np.int16)), axis=2) <= 12
    flood = Image.fromarray(np.pad(np.where(similar | ~visible, 0, 255).astype(np.uint8), 1)).copy()
    ImageDraw.floodfill(flood, (0, 0), 128, border=255)
    excluded = (np.asarray(flood)[1:-1, 1:-1] == 128) | ~visible
    return excluded, {'background_method': 'border-connected', 'background_color': color.astype(int).tolist(),
                      'background_pixels': int(excluded.sum())}


def foreground(image, mode, threshold_mode, threshold, background, inversion):
    rgba = np.asarray(image)
    alpha = rgba[:, :, 3]
    has_alpha = bool(np.any(alpha < 128))
    visible = alpha >= 128
    excluded, background_info = analyze_background(rgba) if background == 'auto' else (~visible, {'background_method': 'off'})
    support = visible & ~excluded
    if mode == 'silhouette' and background == 'auto' and has_alpha and not inversion:
        return support, {**background_info, 'segmentation': 'alpha', 'threshold': 128}
    rgb = rgba[:, :, :3]
    gray = np.asarray(image.convert('RGB').convert('L'))
    border = np.concatenate((rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]))
    border_color = np.median(border, axis=0)
    if mode == 'silhouette' and background == 'auto' and not has_alpha:
        contrast = np.max(np.abs(rgb.astype(float) - border_color), axis=2).astype(np.uint8)
        cutoff = max(8, otsu(contrast)) if threshold_mode == 'auto' else threshold
        mask, method = contrast > cutoff, 'border-color'
    else:
        cutoff = max(1, min(254, otsu(gray[visible]))) if threshold_mode == 'auto' and visible.any() else threshold
        light_foreground = not has_alpha and background == 'auto' and float(np.mean(border_color)) < 128
        mask = gray > cutoff if light_foreground else gray <= cutoff
        method = 'luminance'
        if has_alpha and threshold_mode == 'auto' and visible.any() and np.ptp(gray[visible]) == 0:
            mask, method = visible.copy(), 'alpha'
    if inversion:
        mask = ~mask
    return mask & support, {**background_info, 'segmentation': method, 'threshold': cutoff}


def trace_mask(mask, work, tolerance, samples):
    stream = io.BytesIO()
    Image.fromarray(np.where(mask, 0, 255).astype(np.uint8)).save(stream, format='PNG')
    # 'bw' silently selects color tracing in vtracer 0.6.15. The API value is 'binary'.
    svg = vtracer.convert_raw_image_to_svg(stream.getvalue(), img_format='png', colormode='binary',
                                         hierarchical='stacked', mode='spline', filter_speckle=4, path_precision=3)
    work.write_text(svg, encoding='utf-8')
    return parse_svg(svg, tolerance, samples)


def document_elements(groups, mode, width, height):
    host_scale = max(width, height)
    def point(p):
        return {'x': round((p[0] - width / 2) / host_scale * 64, 6),
                'y': round((height / 2 - p[1]) / host_scale * 64, 6)}
    elements = []
    for group in groups:
        if mode == 'line-art':
            for ring in group:
                closed = ring if ring[-1] == ring[0] else ring + ring[:1]
                elements.append({'type': 'polyline', 'points': [point(p) for p in closed]})
        else:
            elements.append({'type': 'fill', 'regions': [[point(p) for p in (ring[:-1] if ring[-1] == ring[0] else ring)] for ring in group],
                             'fillRule': 'evenodd', 'opacity': 1, 'compactExport': True})
    for index, element in enumerate(elements):
        element['id'] = str(uuid.uuid5(uuid.NAMESPACE_URL, f'hub-thunder-generator/{mode}/{index}/' + json.dumps(element, separators=(',', ':'))))
    return elements


def geometry_stats(elements):
    contours = [ring for e in elements for ring in (e['regions'] if e['type'] == 'fill' else [e['points']])]
    return {'objects': len(elements), 'points': sum(map(len, contours)), 'contours': len(contours),
            'curves': sum(e['type'] == 'curve' for e in elements),
            'segments': sum(sum(len(r) for r in e['regions']) if e['type'] == 'fill' else len(e['points']) - 1 for e in elements)}


def generate(image, args, work):
    ow, oh = image.size
    w, h = max(1, round(ow * args.scale / 100)), max(1, round(oh * args.scale / 100))
    if w * h > 50_000_000:
        raise ValueError('Processing image exceeds 50 megapixels.')
    image = image.resize((w, h), Image.Resampling.LANCZOS)
    if args.invert:
        image = ImageOps.mirror(image)
    mask, preprocessing = foreground(image, args.mode, args.threshold_mode, args.threshold, args.background, args.inversion)
    # Control-polygon flatness bounds curve error; RDP gets the remaining budget.
    tolerance = .7 + (100 - args.detail) / 100 * 1.1
    if args.mode == 'stencil':
        tolerance *= .5
    if args.mode == 'line-art':
        tolerance *= (1 + (args.line_weight - 1) * .12) * math.sqrt(12 / max(6, args.n_segments))
    groups, baseline, source_curves = trace_mask(mask, work, tolerance * .25, args.n_segments)
    if args.mode == 'silhouette' and groups:
        largest = max(range(len(groups)), key=lambda i: abs(area(groups[i][0])))
        groups, baseline = [[groups[largest][0]]], [[baseline[largest][0]]]
    optimized = []
    for group, dense_group in zip(groups, baseline):
        rings = [ring if len(set(ring)) >= 3 else dense for ring, dense in zip(group, dense_group)]
        optimized.append(optimize_group(rings, tolerance * .75))
    before_elements = document_elements(baseline, args.mode, w, h)
    elements = document_elements(optimized, args.mode, w, h)
    if not elements:
        raise ValueError('NoForeground: No visible foreground was found. Adjust the threshold or background setting.')
    before, after = geometry_stats(before_elements), geometry_stats(elements)
    if after['objects'] > args.max_objects or after['segments'] > args.max_lines:
        raise ValueError('GeometryBudgetExceeded: Increase geometry limits or reduce detail/processing scale; no contours were discarded.')
    mode_name = args.mode.upper().replace('-', '_')
    common = {'metadata': {'name': Path(args.input).stem, 'version': 1, 'width': w, 'height': h,
                           'sourceWidth': ow, 'sourceHeight': oh, 'sourceAspectRatio': ow / oh, 'processingWidth': w, 'processingHeight': h},
              'generatorSettings': {'mode': args.mode, 'lineWeight': args.line_weight, 'nSegments': args.n_segments,
                                    'detail': args.detail, 'thresholdMode': args.threshold_mode, 'threshold': args.threshold,
                                    'maxObjects': args.max_objects, 'maxLines': args.max_lines,
                                    'background': args.background, 'invert': args.invert, 'inversion': args.inversion},
              'settings': {'thousandth': True}}
    stages = f"{preprocessing['background_method']} -> {preprocessing['segmentation']} -> binary VTracer -> " + ('largest external region -> ' if args.mode == 'silhouette' else '') + 'adaptive curves -> topology-checked simplification -> DRAW'
    return {**common, 'requestedMode': mode_name, 'processedMode': mode_name, 'elements': elements,
            'optimizationBaseline': {**common, 'elements': before_elements},
            'stats': {**after, 'raw_paths': sum(map(len, baseline)), 'candidates': after['contours'],
                      'source_width': ow, 'source_height': oh, 'processing_width': w, 'processing_height': h,
                      'sight_host_width': w, 'sight_host_height': h, 'aspect_ratio': w / h, 'mode': args.mode,
                      'processor': args.mode, 'vectorizer': 'vtracer', 'stages': stages, 'line_weight': args.line_weight,
                      'n_segments': args.n_segments, **preprocessing,
                      'optimization': {'before': before, 'after': after.copy(), 'source_curves': source_curves,
                                       'tolerance_px': tolerance, 'discarded_contours': before['contours'] - after['contours']}}}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', default='')
    parser.add_argument('--inspect-only', action='store_true')
    for name, default in [('scale', 100), ('detail', 100), ('threshold', 128), ('max-objects', 250),
                          ('max-lines', 5000), ('line-weight', 1), ('n-segments', 12)]:
        parser.add_argument('--' + name, type=int, default=default)
    parser.add_argument('--mode', choices=['line-art', 'stencil', 'silhouette'], default='line-art')
    parser.add_argument('--threshold-mode', choices=['auto', 'manual'], default='auto')
    parser.add_argument('--background', choices=['auto', 'off'], default='auto')
    parser.add_argument('--invert', action='store_true')
    parser.add_argument('--inversion', action='store_true')
    args = parser.parse_args()
    if not (2 <= args.n_segments <= 256 and 0 <= args.threshold <= 255 and 1 <= args.scale <= 100
            and 1 <= args.detail <= 100 and 1 <= args.line_weight <= 4 and 1 <= args.max_objects <= 100000
            and 1 <= args.max_lines <= 100000):
        raise ValueError('Invalid generator settings.')
    source = Path(args.input).expanduser().resolve()
    if not source.is_file() or source.stat().st_size == 0:
        raise FileNotFoundError('Input image file was not created or is no longer available.')
    try:
        with Image.open(source) as check:
            image_format, size = check.format, check.size
            if size[0] * size[1] > 100_000_000:
                raise ValueError('Input image exceeds 100 megapixels.')
            check.verify()
        if args.inspect_only:
            print(json.dumps({'filename': source.name, 'size': source.stat().st_size, 'signature': image_format,
                              'decoder': 'Pillow 11.3.0', 'width': size[0], 'height': size[1], 'pixelFormat': 'decoded'}))
            return
        with Image.open(source) as decoded:
            image = ImageOps.exif_transpose(decoded).convert('RGBA')
    except (UnidentifiedImageError, OSError, SyntaxError) as exc:
        print(f'decode_failure type={type(exc).__name__} message={exc}', file=__import__('sys').stderr, flush=True)
        raise
    if not args.output:
        raise ValueError('--output is required for generation.')
    output = Path(args.output).expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    document = generate(image, args, output.with_suffix('.svg'))
    output.write_text(json.dumps(document, separators=(',', ':')), encoding='utf-8')
    print(json.dumps(document['stats']), flush=True)


if __name__ == '__main__':
    main()
