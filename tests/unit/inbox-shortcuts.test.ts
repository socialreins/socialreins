// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { shortcutFor, type Shortcut } from "@/lib/inbox";

afterEach(() => document.body.replaceChildren());

// The shortcut a real key press on `target` gives, as a document listener sees it.
function press(target: Element, key: string, mods: KeyboardEventInit = {}) {
  let got: Shortcut | null = null;
  const onKey = (e: KeyboardEvent) => (got = shortcutFor(e));
  document.addEventListener("keydown", onKey);
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...mods }));
  document.removeEventListener("keydown", onKey);
  return got;
}
const add = (html: string) => {
  document.body.innerHTML = html;
  return document.body.querySelector("[data-t]")!;
};

it("maps each key, in either case", () => {
  const keys = { j: "next", k: "previous", e: "done", r: "reply", a: "assign", "/": "search", "?": "help", "[": "previousInbox", "]": "nextInbox" };
  for (const [key, name] of Object.entries(keys)) expect(press(document.body, key)).toBe(name);
  expect(press(document.body, "J")).toBe("next");
  expect(press(document.body, "?", { shiftKey: true })).toBe("help");
  expect(press(add("<a href='#' data-t>row</a>"), "e")).toBe("done");
  // Saved views and Clear: 1 to 9, 0 and Escape.
  for (const n of "123456789") expect(press(document.body, n)).toBe(`view${n}`);
  expect(press(document.body, "0")).toBe("clear");
  expect(press(document.body, "Escape")).toBe("clear");
  expect(press(add("<input data-t>"), "1")).toBeNull();
  // A ticked box is not typing: the view keys work right after a filter is ticked.
  expect(press(add("<input type='checkbox' data-t>"), "0")).toBe("clear");
  expect(press(add("<input type='radio' data-t>"), "2")).toBe("view2");
  expect(press(add("<input data-t>"), "Escape")).toBeNull();
  expect(press(document.body, "x")).toBeNull();
  expect(press(document.body, "Enter")).toBeNull();
});

it("never fires while typing", () => {
  for (const html of [
    "<input data-t>",
    "<input type='search' data-t>",
    "<textarea data-t></textarea>",
    "<select data-t><option>a</option></select>",
    "<div contenteditable data-t></div>",
    "<div contenteditable='true'><b data-t>deep</b></div>",
  ])
    for (const key of ["j", "k", "e", "r", "a", "/", "?", "[", "]"]) expect(press(add(html), key), `${key} in ${html}`).toBeNull();
});

it("never fires with a modifier key, in a dialog or in a menu", () => {
  expect(press(document.body, "r", { metaKey: true })).toBeNull();
  expect(press(document.body, "r", { ctrlKey: true })).toBeNull();
  expect(press(document.body, "a", { altKey: true })).toBeNull();
  expect(press(add("<dialog open><button data-t>Close</button></dialog>"), "e")).toBeNull();
  expect(press(add("<div role='menu'><button data-t>Item</button></div>"), "j")).toBeNull();
});
