describe('privacy page HTML escaping', () => {
  function escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  it('escapes HTML entities', () => {
    expect(escapeHtml(`a <b> & "c"`)).toBe('a &lt;b&gt; &amp; &quot;c&quot;');
  });

  it('keeps Arabic text intact', () => {
    expect(escapeHtml('سياسة الخصوصية')).toBe('سياسة الخصوصية');
  });
});
