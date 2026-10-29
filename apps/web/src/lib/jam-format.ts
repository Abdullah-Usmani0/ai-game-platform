/** A moment as the jam pages print it: the same on the server and in the browser (no locale, no time zone). */
export const utc = (iso: string): string => `${new Date(iso).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
