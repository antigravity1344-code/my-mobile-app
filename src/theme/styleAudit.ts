/** Source-level style audit used by the styling tests (screens can't render under vitest). */
export const OLD_PALETTE = ['#0f172a', '#1e293b', '#334155', '#0284c7', '#0369a1', '#38bdf8', '#e0f2fe', '#f0f9ff', '#bae6fd'];

export function styleSheetBlock(source: string): string {
  const k = source.indexOf('StyleSheet.create(');
  return k < 0 ? '' : source.slice(k);
}

export function auditStyledSource(source: string) {
  const block = styleSheetBlock(source);
  const smallFonts = [...source.matchAll(/fontSize:\s*(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1])).filter((n) => n < 12);
  const weights = [...block.matchAll(/fontWeight\s*:/g)].length;
  const oldColors = OLD_PALETTE.filter((hex) => source.toLowerCase().includes(`'${hex}'`) || source.toLowerCase().includes(`"${hex}"`));
  const importsTheme = /from '(\.\.\/)+theme(\/index)?'/.test(source);
  return { smallFonts, weights, oldColors, importsTheme };
}
