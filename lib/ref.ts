// What an address holds for a list, automation, broadcast, newsletter, inbox, inbox item or contact: its number
// (/lists/12, ?item=4821). A brain from before numbers sends none, so the id stands in (brain's API takes either).
// `addressOf` is for a thing another answer only points at (a run's inbox item): its id and number.
export const addressOf = (id: string, number?: number | null) => String(number ?? id);
export const address = (x: { id: string; number?: number }) => addressOf(x.id, x.number);
export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

// An old query value with the UUID (?contact=, ?item=) moves to the number the same way.
export const moveParam = (name: string, asked: string, x: { id: string; number?: number }) => {
  if (!x.id || asked === address(x)) return;
  const url = new URL(window.location.href);
  url.searchParams.set(name, address(x));
  window.history.replaceState(null, "", url);
};

// An old address with the UUID (/lists/<uuid>) moves to the number once the page has read the thing, as the post page does.
export const moveToNumber = (asked: string, x: { id: string; number?: number }) => {
  if (!x.id || asked === address(x)) return;
  const url = new URL(window.location.href);
  url.pathname = url.pathname.replace(/[^/]+\/?$/, address(x));
  window.history.replaceState(null, "", url);
};
