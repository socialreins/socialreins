import { expect, test, type Page } from "@playwright/test";

const me = {
  id: "u-me",
  email: "me@example.com",
  name: "Me",
  username: null,
  current_team: { id: "t1", name: "Acme", code: "acme22", role: "owner" },
};
const threads = {
  id: "th1",
  provider: "threads",
  external_id: "1",
  handle: "the_nomadic_dev",
  display_name: "The Nomadic Dev",
  avatar_url: null,
  token_expires_at: null,
  set_ids: ["d"],
  dm_access: false,
  created_at: "2026-10-20T10:00:00Z",
};
const post = (id: string, body: string) => ({
  id: `p-${id}`,
  body,
  status: "published",
  targets: [{ id: `t-${id}`, social_account_id: "th1", status: "published", remote_id: id, remote_url: `https://www.threads.com/@the_nomadic_dev/post/${id}`, error: null, published_at: "2026-11-20T10:00:00Z", parts: [] }],
});

async function brain(page: Page) {
  const saved: unknown[] = [];
  await page.route("**/auth/me", (route) => route.fulfill({ json: me }));
  await page.route("**/v1/connections", (route) => route.fulfill({ json: [threads] }));
  await page.route(/\/v1\/social-sets$/, (route) => route.fulfill({ json: [{ id: "d", name: "All sets", is_default: true, account_ids: ["th1"], account_count: 1, created_at: "", deleted_at: null }] }));
  await page.route(/\/v1\/posts\?.*status=published/, (route) =>
    route.fulfill({ json: [post("17900000000000001", "Our free plan launch"), post("17900000000000002", "A second post")] }),
  );
  await page.route("**/v1/automations", (route) => {
    if (route.request().method() === "POST") {
      saved.push(route.request().postDataJSON());
      return route.fulfill({ status: 201, json: { id: "a1", ...route.request().postDataJSON() } });
    }
    return route.fulfill({ json: [] });
  });
  return saved;
}

test("a Threads account's automation picks its post from the posts made here and says what Threads cannot do", async ({ page }) => {
  await brain(page);
  await page.goto("/automations/new?template=comment-to-dm");
  await page.getByLabel("Pick accounts").check();
  await page.getByLabel("The Nomadic Dev, Threads").check();
  await page.getByLabel("Specific posts").check();
  const picker = page.getByLabel("Add one of your posts");
  await expect(picker).toBeVisible();
  const add = page.getByRole("button", { name: "Add", exact: true });
  await expect(add).toBeDisabled();
  await picker.selectOption({ label: "Our free plan launch (17900000000000001)" });
  await add.click();
  await picker.selectOption({ label: "A second post (17900000000000002)" });
  await add.click();
  await expect(page.getByLabel("Post links")).toHaveValue("17900000000000001\n17900000000000002");
  // Picking one twice adds it once.
  await picker.selectOption({ label: "A second post (17900000000000002)" });
  await add.click();
  await expect(page.getByLabel("Post links")).toHaveValue("17900000000000001\n17900000000000002");
  // A DM on Threads is said to be impossible before anything is saved.
  await page.getByLabel("DM text").fill("Hi {name}");
  await page.getByRole("button", { name: /problems?$/ }).click();
  await expect(page.getByText("Threads has no DMs and no private reply").first()).toBeVisible();
});
