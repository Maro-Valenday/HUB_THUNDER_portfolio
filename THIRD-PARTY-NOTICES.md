# Third-party notices

## JSON Canonicalization

JsonCanonicalizer 1.0.0 and its ES6NumberSerializer 1.0.0 dependency are used
to verify NOWPayments signatures with compatible JSON number serialization.
Copyright 2006-2019 WebPKI.org. Apache License 2.0.
Source: https://github.com/cyberphone/json-canonicalization/tree/master/dotnet
License: `licenses/Apache-2.0.txt`.

## Lucide

Lucide 0.468.0, ISC License. Source: https://lucide.dev
The local toolbar icon bundle and license are in `wwwroot/js/lucide.min.js`
and `wwwroot/js/lucide.LICENSE`.

## Clipper2

Clipper2 1.5.4, Angus Johnson, Boost Software License 1.0.
Source: https://github.com/AngusJohnson/Clipper2
Used for polygon union/intersection and round stroke offsetting in Draw export.
The NuGet package includes the complete license in `License.txt`.

## ImageToWTSight

Copyright (c) 2023 Nova (Novuhh). MIT License.

Source: https://github.com/Novuhh/ImageToWTSight

The reference implementation was studied for its Potrace-based SVG path workflow, curve sampling, scaling and War Thunder export conventions. HUB THUNDER does not bundle the original React application or copy its source modules; the current browser pipeline is an independent implementation using connected-component boundary tracing and Ramer-Douglas-Peucker simplification.

The original MIT license text is retained at `WT-Sight-Tools/resursers for draw wt sights/ImageToWTSight-main/LICENSE`.

## Adaptive Sight / FCS Manager

Author: assin127. Source: the user-supplied `Adaptive Sight/Tochka2sm_17_10_25.zip`,
containing `FCSManager.7z` and `FCS-Manager-for-War-Tnunder-main`.
The six geometry generators, ballistic calculation and vehicle/ammunition data
are retained in `AdaptiveSight/`. See `AdaptiveSight/README.md` and
`AdaptiveSight/source-manifest.json` for provenance and modifications.
The supplied archive contains no separate license file; no license is inferred.
The desktop executable and WinForms application are not shipped with the web tool.

## Benchmark-only vectorizers

VTracer 0.6.15 is used by `tools/run_pipeline_benchmark.py` under its MIT license.
Source: https://github.com/visioncortex/vtracer

The benchmark also uses `potracer` 0.0.4, a pure-Python Potrace port distributed under GPLv2+.
It is isolated to the optional benchmark environment (`.venv313`) and is not linked into the
ASP.NET Core production application. Source: https://github.com/tatarize/potrace
# WT-FCSGenerator compatibility

Adaptive Sight also references tsvl/WT-FCSGenerator main
e905630fe41b4efb5b7166d3b1190d0701cce76f (v2.2.1 calculation pipeline).
Original sight families: Assin127; current extraction/ballistics maintenance: tsvl.
AdaptiveCurrentBallistics.cs ports the pinned Rust calculation to C#; no upstream
executable is loaded by the site. Current/ data was extracted from War Thunder
2.59.0.11, whose content belongs to its respective owners. See
AdaptiveSight/COMPATIBILITY-AUDIT.md and current-manifest.json for provenance.
