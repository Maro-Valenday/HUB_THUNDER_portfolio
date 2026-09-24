(() => {
  const input = document.querySelector('input[name="previewImage"]');
  if (!input) return;
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file && file.size > 10 * 1024 * 1024) {
      input.value = '';
      const ru = document.documentElement.lang?.toLowerCase().startsWith('ru');
      alert(ru ? 'Размер изображения не должен превышать 10 MiB.' : 'Image exceeds the maximum size of 10 MiB.');
    }
  });
})();
