// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { address, addressOf, isUuid, moveParam, moveToNumber } from "@/lib/ref";

const ID = "01a2111a-7943-70e9-85db-000000000001";
const go = (to: string) => window.history.replaceState(null, "", to);

describe("addresses by number", () => {
  it("holds the number, and the id for a brain that sends none", () => {
    expect(address({ id: ID, number: 12 })).toBe("12");
    expect(address({ id: ID })).toBe(ID);
    expect(addressOf(ID, null)).toBe(ID);
    expect(addressOf(ID, 4821)).toBe("4821");
    expect(isUuid(ID)).toBe(true);
    expect(isUuid("12")).toBe(false);
  });
});

describe("an old address moves to the number", () => {
  beforeEach(() => go("/"));

  it("moves the last path segment and keeps the query", () => {
    go(`/t/acme22/lists/${ID}?x=1`);
    moveToNumber(ID, { id: ID, number: 12 });
    expect(window.location.pathname + window.location.search).toBe("/t/acme22/lists/12?x=1");
  });

  it("leaves an address the person has already left", () => {
    go("/t/acme22/posts/7");
    moveToNumber(ID, { id: ID, number: 12 });
    expect(window.location.pathname).toBe("/t/acme22/posts/7");
  });

  it("moves a query value, and not one that changed meanwhile", () => {
    go(`/t/acme22/inbox?item=${ID}&state=done`);
    moveParam("item", ID, { id: ID, number: 4821 });
    expect(window.location.search).toBe("?item=4821&state=done");
    go("/t/acme22/contacts?contact=5");
    moveParam("item", ID, { id: ID, number: 4821 });
    moveParam("contact", ID, { id: ID, number: 33 });
    expect(window.location.search).toBe("?contact=5");
  });
});
