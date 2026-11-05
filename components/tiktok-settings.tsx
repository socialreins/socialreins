"use client";

import type { Failure } from "@/lib/auth";
import { privacyName, type TikTokCreator, type TikTokSettings } from "@/lib/posts";
import { isFailure, problemText } from "@/components/team-ui";
import { postMessages } from "@/components/posts";

const MUSIC = "https://www.tiktok.com/legal/page/global/music-usage-confirmation/en";
const BRANDED = "https://www.tiktok.com/legal/page/global/bc-policy/en";

const linkClass = "font-bold underline";
const External = ({ href, children }: { href: string; children: string }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
    {children}
  </a>
);

// The consent declaration TikTok's Content Sharing Guidelines require before the publish button: the Branded
// Content Policy joins the Music Usage Confirmation when Branded content is ticked.
export function TikTokConsent({ settings }: { settings: TikTokSettings }) {
  return (
    <p id="tiktok-consent" className="text-sm">
      By posting, you agree to TikTok&apos;s{" "}
      {settings.commercial_content && settings.branded_content && (
        <>
          <External href={BRANDED}>Branded Content Policy</External> and{" "}
        </>
      )}
      <External href={MUSIC}>Music Usage Confirmation</External>.
    </p>
  );
}

// The controls TikTok asks for on a direct post: who can see it (no default), the interactions (all off), the
// content disclosure and the AI-generated flag. `creator` is the account's live creator info.
export function TikTokPanel({
  creator,
  settings,
  onChange,
  photosOnly,
  onRetry,
}: {
  creator: TikTokCreator | Failure | null;
  settings: TikTokSettings;
  onChange: (next: TikTokSettings) => void;
  photosOnly: boolean;
  onRetry: () => void;
}) {
  const set = (patch: Partial<TikTokSettings>) => onChange({ ...settings, ...patch });
  const heading = (
    <h3 id="tiktok-heading" className="font-display text-base font-extrabold tracking-tight">
      TikTok settings
    </h3>
  );
  if (creator === null)
    return (
      <section aria-labelledby="tiktok-heading" className="grid gap-2">
        {heading}
        <p className="hint" role="status">
          Loading the TikTok account...
        </p>
      </section>
    );
  if (isFailure(creator))
    return (
      <section aria-labelledby="tiktok-heading" className="grid gap-2">
        {heading}
        <p role="alert" className="waitlist-error">
          The TikTok account couldn&apos;t be read. {problemText(creator, postMessages)}
        </p>
        <button type="button" className="btn btn-secondary btn-sm justify-self-start" onClick={onRetry}>
          Try again
        </button>
      </section>
    );
  const level = creator.privacy_level_options.includes(settings.privacy_level ?? "") ? (settings.privacy_level ?? "") : "";
  const branded = settings.commercial_content && settings.branded_content;
  const label = photosOnly ? "photo" : "video";
  const minutes = creator.max_video_post_duration_sec ? Math.floor(creator.max_video_post_duration_sec / 60) : 0;
  return (
    <section aria-labelledby="tiktok-heading" className="grid gap-4">
      {heading}
      <p className="text-sm">
        Posting to <strong data-tiktok-account>{creator.nickname}</strong>.
        {creator.max_video_post_duration_sec ? ` This account can post videos up to ${minutes >= 1 ? `${minutes} minute${minutes === 1 ? "" : "s"}` : `${creator.max_video_post_duration_sec} seconds`}.` : ""}
      </p>
      {!creator.can_post && (
        <p role="alert" className="waitlist-error">
          {creator.reason ?? "TikTok does not let this account post right now."} Try again later.
        </p>
      )}
      <div className="grid gap-1.5">
        <label htmlFor="tiktok-privacy" className="label">
          Who can view this {label}
        </label>
        <select id="tiktok-privacy" className="field" value={level} onChange={(e) => set({ privacy_level: e.target.value || null })} aria-describedby="tiktok-privacy-note">
          <option value="">Select who can view this {label}</option>
          {creator.privacy_level_options.map((o) => (
            <option key={o} value={o} disabled={o === "SELF_ONLY" && branded}>
              {privacyName[o] ?? o}
            </option>
          ))}
        </select>
        <p id="tiktok-privacy-note" className="hint">
          {branded ? "Branded content visibility cannot be set to private." : "Only the options TikTok offers this account are listed."}Until TikTok has reviewed SocialReins, it may only post privately.
        </p>
      </div>
      <fieldset className="grid gap-2">
        <legend className="label">Allow users to</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={settings.allow_comment && !creator.comment_disabled} disabled={creator.comment_disabled} onChange={(e) => set({ allow_comment: e.target.checked })} />
          Comment{creator.comment_disabled ? " (turned off in your TikTok settings)" : ""}
        </label>
        {!photosOnly && (
          <>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={settings.allow_duet && !creator.duet_disabled} disabled={creator.duet_disabled} onChange={(e) => set({ allow_duet: e.target.checked })} />
              Duet{creator.duet_disabled ? " (turned off in your TikTok settings)" : ""}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={settings.allow_stitch && !creator.stitch_disabled} disabled={creator.stitch_disabled} onChange={(e) => set({ allow_stitch: e.target.checked })} />
              Stitch{creator.stitch_disabled ? " (turned off in your TikTok settings)" : ""}
            </label>
          </>
        )}
      </fieldset>
      <fieldset className="grid gap-2">
        <legend className="label">Content disclosure setting</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            role="switch"
            checked={settings.commercial_content}
            onChange={(e) => set(e.target.checked ? { commercial_content: true } : { commercial_content: false, your_brand: false, branded_content: false })}
            aria-describedby="tiktok-disclosure-note"
          />
          Disclose post content
        </label>
        <p id="tiktok-disclosure-note" className="hint">
          Turn on to disclose that this {label} promotes goods or services in exchange for something of value. It could promote yourself, a third party, or both.
        </p>
        {settings.commercial_content && (
          <div className="grid gap-2 pl-6">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={settings.your_brand} onChange={(e) => set({ your_brand: e.target.checked })} />
              Your brand
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={settings.branded_content} disabled={level === "SELF_ONLY"} onChange={(e) => set({ branded_content: e.target.checked })} aria-describedby="tiktok-branded-note" />
              Branded content
            </label>
            {level === "SELF_ONLY" && (
              <p id="tiktok-branded-note" className="hint">
                Branded content visibility cannot be set to private. Choose another visibility to use it.
              </p>
            )}
            {!settings.your_brand && !settings.branded_content ? (
              <p role="alert" className="waitlist-error">
                You need to indicate if your content promotes yourself, a third party, or both.
              </p>
            ) : (
              <p className="hint">
                Your {label} will be labeled as &apos;{settings.branded_content ? "Paid partnership" : "Promotional content"}&apos;.
              </p>
            )}
          </div>
        )}
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={settings.ai_generated} onChange={(e) => set({ ai_generated: e.target.checked })} />
        This {label} is AI-generated
      </label>
      <p className="hint">After TikTok takes the {label}, it may take a few minutes to process and show on your profile.</p>
    </section>
  );
}
