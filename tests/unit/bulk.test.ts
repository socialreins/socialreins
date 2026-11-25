import { describe, expect, it } from "vitest";
import { failuresCsv, parseTime, readCsv, rowInput, templateCsv, type BulkRow } from "@/lib/bulk";
import { csvCell, parseCsv } from "@/lib/csv";
import type { Platform } from "@/lib/posts";

describe("parseCsv", () => {
  it("splits fields and rows, with LF or CRLF, and keeps a last row without a line break", () => {
    expect(parseCsv("a,b\r\n1,2\n3,4")).toEqual([["a", "b"], ["1", "2"], ["3", "4"]]);
    expect(parseCsv("a,b\r\n")).toEqual([["a", "b"]]);
    expect(parseCsv("a\rb\r")).toEqual([["a"], ["b"]]);
  });

  it("reads quoted fields with commas, escaped quotes and line breaks", () => {
    expect(parseCsv('"a, b","say ""hi""","two\r\nlines"\n')).toEqual([["a, b", 'say "hi"', "two\r\nlines"]]);
    expect(parseCsv('"",x')).toEqual([["", "x"]]);
  });

  it("drops a byte order mark, keeps empty fields and blank lines", () => {
    expect(parseCsv("﻿text,time\n,\n\nhi,")).toEqual([["text", "time"], ["", ""], [""], ["hi", ""]]);
  });

  it("keeps a quote inside an unquoted field as it is", () => {
    expect(parseCsv('5" screen,x')).toEqual([['5" screen', "x"]]);
  });
});

describe("csvCell", () => {
  it("quotes what needs it and defuses formulas", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('a "b", c')).toBe('"a ""b"", c"');
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-2,3")).toBe("\"'-2,3\"");
    expect(csvCell("-news@b.co", true)).toBe("-news@b.co");
    expect(csvCell("-news@b.co")).toBe("'-news@b.co");
  });
});

const now = new Date(2026, 10, 20, 12, 0);
const read = (csv: string, available: readonly Platform[] = ["bluesky", "x", "facebook", "youtube", "instagram", "tiktok"]) => {
  const r = readCsv(csv, [...available], now);
  if (typeof r === "string") throw new Error(r);
  return r;
};

describe("readCsv", () => {
  it("maps columns by name in any order, ignores extra columns and blank lines", () => {
    const [row, ...rest] = read("Time,extra,TEXT,networks\n2026-11-25 09:30,zzz,Hello,bluesky x\n,,,\n");
    expect(rest).toHaveLength(0);
    expect(row!.n).toBe(1);
    expect(row!.text).toBe("Hello");
    expect(row!.networks).toEqual(["bluesky", "x"]);
    expect(row!.when).toEqual({ kind: "at", iso: new Date(2026, 10, 25, 9, 30).toISOString() });
    expect(row!.errors).toEqual([]);
    expect(row!.cells).toEqual({ text: "Hello", networks: "bluesky x", media: "", time: "2026-11-25 09:30", first_comment: "" });
  });

  it("refuses a file without a text column, with no rows, or over 200 rows", () => {
    expect(readCsv("body\nhi", ["bluesky"], now)).toMatch(/at least text/);
    expect(readCsv("text\n\n", ["bluesky"], now)).toMatch(/no posts/);
    expect(readCsv(`text\n${"hi\n".repeat(201)}`, ["bluesky"], now)).toMatch(/201 posts/);
    expect(read(`text\n${"hi\n".repeat(200)}`)).toHaveLength(200);
  });

  it("defaults networks to the set's, without TikTok, and without Instagram and YouTube on a row with no media", () => {
    const [text, withMedia] = read("text,media\nhi,\nhi,https://a.co/v.mp4");
    expect(text!.networks).toEqual(["bluesky", "x", "facebook"]);
    expect(withMedia!.networks).toEqual(["bluesky", "x", "facebook", "youtube", "instagram"]);
  });

  it("leaves Pinterest out unless a row names it, and refuses it without media", () => {
    const withPin: Platform[] = ["bluesky", "pinterest"];
    const [none, some, named] = read("text,media,networks\nhi,,\nhi,https://a.co/p.jpg,\nhi,,pinterest", withPin);
    expect(none!.networks).toEqual(["bluesky"]);
    expect(some!.networks).toEqual(["bluesky"]);
    expect(named!.errors).toEqual(["Pinterest needs an image or a video: add its link under media."]);
  });

  it("names unknown, unconnected and TikTok networks, and accepts commas and case", () => {
    const [row] = read("text,networks\nhi,\"Bluesky, myspace,threads tiktok\"");
    expect(row!.networks).toEqual(["bluesky"]);
    expect(row!.errors).toEqual([
      expect.stringContaining('"myspace" isn\'t a network'),
      "The set has no Threads account.",
      expect.stringContaining("Post to TikTok from the composer"),
    ]);
  });

  it("says when the set has nothing to post to", () => {
    expect(readCsv("text\nhi", ["tiktok"], now)).toEqual([expect.objectContaining({ errors: [expect.stringContaining("no connected network")] })]);
  });

  it("reads time as a local time, queue or a draft, and refuses bad and past times", () => {
    const rows = read("text,time\na,\nb,QUEUE\nc,2026-11-20T13:00\nd,tomorrow\ne,2026-02-30 09:00\nf,2026-11-20 11:59\ng,2026-11-20 12:00");
    expect(rows.map((r) => r.when?.kind ?? null)).toEqual(["draft", "queue", "at", null, null, null, null]);
    expect(rows[3]!.errors[0]).toMatch(/"tomorrow" isn't a time/);
    expect(rows[4]!.errors[0]).toMatch(/isn't a time/);
    expect(rows[5]!.errors).toEqual(["2026-11-20 11:59 is in the past."]);
    expect(rows[6]!.errors).toEqual(["2026-11-20 12:00 is in the past."]);
  });

  it("checks text, media links, YouTube's video and where a first comment can go", () => {
    const rows = read(
      'text,networks,media,first_comment\n" ",bluesky,,\nhi,bluesky,http://a.co/x.jpg https://b.co/y.jpg,\nhi,youtube,,\nhi,bluesky x,,thanks\nhi,bluesky facebook,,thanks',
    );
    expect(rows[0]!.errors).toEqual(["The text is missing."]);
    expect(rows[1]!.errors).toEqual(["Media must be public https links: http://a.co/x.jpg isn't one."]);
    expect(rows[1]!.media).toEqual(["http://a.co/x.jpg", "https://b.co/y.jpg"]);
    expect(rows[2]!.errors).toEqual(["YouTube needs a video: add its link under media."]);
    expect(rows[3]!.errors).toEqual(["Only Facebook, Instagram, LinkedIn and YouTube take a first comment."]);
    expect(rows[4]!.errors).toEqual([]);
  });
});

describe("parseTime", () => {
  it("takes a space or T and refuses dates that don't exist", () => {
    expect(parseTime("2026-11-25 09:30")?.getHours()).toBe(9);
    expect(parseTime("2026-11-25T09:30")?.getMinutes()).toBe(30);
    expect(parseTime("2026-13-01 09:30")).toBeNull();
    expect(parseTime("2026-11-25 24:00")).toBeNull();
    expect(parseTime("25/11/2026 09:30")).toBeNull();
  });
});

describe("rowInput", () => {
  const row = (csv: string): BulkRow => read(`text,networks,media,time,first_comment\n${csv}`)[0]!;

  it("sends one network as a post, with scheduled_at", () => {
    expect(rowInput(row("hi,bluesky,,2026-11-25 09:30,"), "s1")).toEqual({
      one: { social_set_id: "s1", platform: "bluesky", body: "hi", media: [], scheduled_at: new Date(2026, 10, 25, 9, 30).toISOString() },
    });
  });

  it("sends several as a group, queue without scheduled_at, a draft with null", () => {
    expect(rowInput(row("hi,bluesky x,,queue,"), "s1")).toEqual({ group: { social_set_id: "s1", platforms: ["bluesky", "x"], body: "hi", media: [], queue: true } });
    expect(rowInput(row("hi,bluesky x,,,"), "s1")).toEqual({
      group: { social_set_id: "s1", platforms: ["bluesky", "x"], body: "hi", media: [], scheduled_at: null },
    });
  });

  it("empties the first comment where it can't go and makes YouTube private", () => {
    expect(rowInput(row("hi,bluesky youtube,https://a.co/v.mp4,,thanks"), "s1")).toEqual({
      group: {
        social_set_id: "s1",
        platforms: ["bluesky", "youtube"],
        body: "hi",
        media: ["https://a.co/v.mp4"],
        scheduled_at: null,
        first_comment: "thanks",
        youtube: { privacy: "private" },
        overrides: { bluesky: { first_comment: "" } },
      },
    });
  });
});

describe("failuresCsv", () => {
  it("writes the original cells and the error, quoted and defused", () => {
    const cells = { text: '=HYPERLINK("x")', networks: "bluesky", media: "", time: "queue", first_comment: "-1, ok" };
    expect(failuresCsv([{ cells, error: "The set has no Threads account." }])).toBe(
      'text,networks,media,time,first_comment,error\r\n"\'=HYPERLINK(""x"")",bluesky,,queue,"\'-1, ok",The set has no Threads account.\r\n',
    );
  });

  it("round-trips through the parser", () => {
    const cells = { text: "two\nlines, \"quoted\"", networks: "x", media: "https://a.co/1.jpg https://a.co/2.jpg", time: "", first_comment: "" };
    expect(parseCsv(failuresCsv([{ cells, error: "e" }]))[1]).toEqual([cells.text, "x", cells.media, "", "", "e"]);
  });
});

describe("failures CSV round trip", () => {
  it("gives back the original text after the formula quote", () => {
    for (const text of ["@brand launch", "-10% today", "=1+1", "+1 more", "'quoted on purpose", "plain"]) {
      const cells = { text, networks: "bluesky", media: "", time: "", first_comment: "-ok" };
      const [row] = read(failuresCsv([{ cells, error: "e" }]));
      expect(row!.text).toBe(text);
      expect(row!.first_comment).toBe("-ok");
    }
  });
});

describe("templateCsv", () => {
  it("reads back as valid rows on a set with the networks it names", () => {
    const rows = read(templateCsv(now), ["bluesky", "linkedin", "facebook"] as never);
    expect(rows).toHaveLength(4);
    expect(rows.flatMap((r) => r.errors)).toEqual([]);
    expect(rows.map((r) => r.when?.kind)).toEqual(["at", "queue", "draft", "draft"]);
  });
});
