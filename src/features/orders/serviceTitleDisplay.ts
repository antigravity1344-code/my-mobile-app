/**
 * Service titles like «نظافت داخل منزل / واحد»: glue the slash to the following word with a
 * no-break space so a line wrap never leaves «/» dangling and the second part alone.
 */
export function displayServiceTitle(title: string | null | undefined): string {
  return (title ?? '').replace(/\/ +/g, '/\u00A0');
}
