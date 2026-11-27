import { afterEach, describe, expect, it, vi } from "vitest";
import { isStorageFull, storageFullText, storageText, uploadFile, type StorageFull } from "@/lib/uploads";

afterEach(() => vi.unstubAllGlobals());

describe("upload storage in words", () => {
  it("says bytes in the units brain's budgets use", () => {
    expect(storageText(0)).toBe("0 bytes");
    expect(storageText(1)).toBe("1 byte");
    expect(storageText(64)).toBe("64 bytes");
    expect(storageText(1024)).toBe("1 KB");
    expect(storageText(1024 ** 2)).toBe("1 MB");
    expect(storageText(100_000_000)).toBe("95.4 MB");
    expect(storageText(1024 ** 3)).toBe("1 GB");
    // The default budget, and a team a bit past it.
    expect(storageText(5 * 1024 ** 3)).toBe("5 GB");
    expect(storageText(1288490189)).toBe("1.2 GB");
    expect(storageText(1_099_511_627_776)).toBe("1024 GB");
  });

  it("says what a full team means, with both numbers", () => {
    expect(storageFullText({ error: "storage_limit", used: 1288490189, budget: 5 * 1024 ** 3 })).toBe(
      "this team's upload storage is full (1.2 GB of 5 GB). An admin can raise it, or add a link in the Library instead.",
    );
  });

  it("tells a full answer from a code", () => {
    const full: StorageFull = { error: "storage_limit", used: 1, budget: 2 };
    expect(isStorageFull(full)).toBe(true);
    expect(isStorageFull("storage_limit")).toBe(false);
    expect(isStorageFull("media_too_large")).toBe(false);
    expect(isStorageFull("error")).toBe(false);
  });

  it("keeps brain's numbers on a 413, and its code otherwise", async () => {
    const answer = (status: number, body: unknown) => {
      class Fake {
        upload = { onprogress: null as null | (() => void) };
        status = 0;
        responseText = "";
        withCredentials = false;
        onload: null | (() => void) = null;
        onerror: null | (() => void) = null;
        onabort: null | (() => void) = null;
        open() {}
        setRequestHeader() {}
        abort() {}
        send() {
          this.status = status;
          this.responseText = JSON.stringify(body);
          this.onload?.();
        }
      }
      vi.stubGlobal("XMLHttpRequest", Fake);
    };
    answer(413, { error: "storage_limit", used: 1288490189, budget: 5 * 1024 ** 3 });
    expect(await uploadFile(new Blob(["x"]))).toEqual({
      error: "storage_limit",
      used: 1288490189,
      budget: 5 * 1024 ** 3,
    });
    answer(413, { error: "media_too_large" });
    expect(await uploadFile(new Blob(["x"]))).toBe("media_too_large");
    // A 413 with no usable numbers is still the code, never a half answer.
    answer(413, { error: "storage_limit" });
    expect(await uploadFile(new Blob(["x"]))).toBe("storage_limit");
  });
});
