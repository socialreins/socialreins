// What SocialReins posts to each network, for the public /<network> pages.
// Mirrors brain's crates/core/src/post.rs and connectors, `limits` and `mediaTypes` in lib/posts.ts,
// and the table on /post-types. A value starts with "Yes", "No" or "Not yet".
export type Network = {
  slug: string;
  name: string;
  // What gets connected, e.g. "a Facebook Page".
  account: string;
  // For search results: 110 to 160 characters (tests/e2e/seo.spec.ts).
  description: string;
  rows: [string, string][];
  sections: { heading: string; text?: string; bullets?: string[] }[];
};

const NOT_YET = (what: string) => `Not yet. ${what} allows it; SocialReins does not post it yet.`;

export const networks: Network[] = [
  {
    slug: "bluesky",
    description: "What SocialReins posts to Bluesky: text up to 300 characters, up to 4 images, one video and threads of up to 25 replies.",
    name: "Bluesky",
    account: "a Bluesky account",
    rows: [
      ["Text only", "Yes, up to 300 characters."],
      ["Images", "Yes, up to 4. JPEG, PNG, WebP or GIF."],
      ["One video", "Yes. MP4 or MOV."],
      ["Thread (reply chain)", "Yes, up to 25 replies after the first post."],
      ["Photos and videos mixed in one post", "No. Bluesky takes images or one video, not both."],
      ["First comment", "No. Use a thread instead."],
      ["Video cover image", "No. Bluesky has no way to set one."],
    ],
    sections: [
      {
        heading: "Good to know",
        bullets: [
          "Bluesky takes images up to 1 MB. A larger photo is made smaller for you before it is posted.",
          "Links in the text become clickable.",
          "You connect with your handle and an app password, not your main password.",
        ],
      },
    ],
  },
  {
    slug: "threads",
    description: "What SocialReins posts to Threads: text up to 500 characters, carousels of up to 20 photos and videos, and reply threads.",
    name: "Threads",
    account: "a Threads account",
    rows: [
      ["Text only", "Yes, up to 500 characters."],
      ["Images", "Yes, up to 20 in a carousel. JPEG or PNG."],
      ["One video", "Yes. MP4 or MOV."],
      ["Photos and videos mixed in one post", "Yes, up to 20 slides."],
      ["Thread (reply chain)", "Yes, up to 25 replies after the first post."],
      ["GIF", "No."],
      ["First comment", "No. Use a thread instead."],
      ["Polls", NOT_YET("Threads")],
    ],
    sections: [],
  },
  {
    slug: "linkedin",
    description: "What SocialReins posts to LinkedIn: text up to 3,000 characters, up to 20 images, one video, a PDF document and a first comment.",
    name: "LinkedIn",
    account: "a LinkedIn account",
    rows: [
      ["Text only", "Yes, up to 3,000 characters."],
      ["Images", "Yes, up to 20. JPEG, PNG or GIF."],
      ["One video", "Yes. MP4."],
      ["PDF document", "Yes, one PDF. LinkedIn shows it as slides to swipe through."],
      ["First comment", "Yes, up to 1,250 characters."],
      ["Photos and videos mixed in one post", "No."],
      ["Thread (reply chain)", "No. LinkedIn has no threads."],
      ["Polls", NOT_YET("LinkedIn")],
    ],
    sections: [
      {
        heading: "Good to know",
        bullets: ["A video or a PDF must be the only file in its post.", "The first comment is a good place for a link."],
      },
    ],
  },
  {
    slug: "facebook",
    description: "What SocialReins posts to a Facebook Page: text, up to 10 images, a Reel with its cover image, and a first comment under the post.",
    name: "Facebook",
    account: "a Facebook Page",
    rows: [
      ["Text only", "Yes, up to 63,206 characters."],
      ["Images", "Yes, up to 10. JPEG, PNG or GIF."],
      ["One video", "Yes, as a Reel. MP4 or MOV."],
      ["Cover image for a Reel", "Yes. JPEG or PNG."],
      ["First comment", "Yes, up to 8,000 characters."],
      ["Photos and videos mixed in one post", "No."],
      ["Stories", NOT_YET("Facebook")],
    ],
    sections: [
      {
        heading: "Good to know",
        bullets: [
          "SocialReins posts to Facebook Pages. Facebook does not let any tool post to a personal profile.",
          "One connect brings in your Pages and the Instagram accounts linked to them.",
        ],
      },
    ],
  },
  {
    slug: "instagram",
    description: "What SocialReins posts to Instagram: photos, Reels, carousels and Motion Carousels of up to 20 slides, covers and first comments.",
    name: "Instagram",
    account: "an Instagram business or creator account",
    rows: [
      ["One photo", "Yes. JPEG, PNG or WebP; PNG and WebP are turned into JPEG for you."],
      ["One video", "Yes, as a Reel. MP4 or MOV."],
      ["Carousel of photos", "Yes, 2 to 20 slides."],
      ["Motion Carousel (videos, or videos and photos mixed)", "Yes, 2 to 20 slides. Any slide can be a video."],
      ["Cover image for a Reel", "Yes. JPEG, PNG or WebP."],
      ["First comment", "Yes, up to 2,200 characters."],
      ["Caption", "Up to 2,200 characters."],
      ["Text only", "No. Instagram needs at least one photo or video."],
      ["Stories", NOT_YET("Instagram")],
    ],
    sections: [
      {
        heading: "Carousels and Motion Carousels",
        text: "A carousel is one post with several slides to swipe through. A Motion Carousel is a carousel where some or all of the slides are videos, so the slides move. Instagram takes both, and SocialReins posts both.",
        bullets: [
          "Up to 20 slides in one carousel. That is Instagram's own limit, not ours.",
          "Photos and videos can be mixed in any order.",
          "Instagram crops every slide to the shape of the first one, so make the first slide the shape you want.",
          "A carousel counts as one post toward Instagram's daily limit.",
          "One video on its own goes out as a Reel, not a carousel.",
        ],
      },
      {
        heading: "Motion Photo",
        text: "Instagram has no API for live or motion photos. Post the clip as an MP4 instead: on its own it goes out as a Reel, and with other photos or videos it becomes a slide in a Motion Carousel.",
      },
    ],
  },
  {
    slug: "youtube",
    description: "What SocialReins posts to YouTube: one video or Short with its title, description, thumbnail and a first comment under it.",
    name: "YouTube",
    account: "a YouTube channel",
    rows: [
      ["One video", "Yes. MP4 or MOV."],
      ["Shorts", "Yes. A short vertical video becomes a Short; YouTube decides."],
      ["Thumbnail (cover image)", "Yes. JPEG or PNG."],
      ["First comment", "Yes, up to 10,000 characters."],
      ["Title", "The first line of your text, up to 100 characters."],
      ["Description", "The rest of your text, up to 5,000 bytes."],
      ["Text only or images", "No. A YouTube post is always one video."],
    ],
    sections: [
      {
        heading: "Good to know",
        bullets: ["YouTube refuses the characters < and > in a title or description."],
      },
    ],
  },
  {
    slug: "x",
    description: "What SocialReins posts to X: text up to 280 characters, up to 4 images, one GIF or video, and threads of up to 25 replies.",
    name: "X",
    account: "an X account",
    rows: [
      ["Text only", "Yes, up to 280 characters, counted the way X counts them."],
      ["Images", "Yes, up to 4. JPEG, PNG or WebP."],
      ["One GIF", "Yes. A GIF must be the only file in its post."],
      ["One video", "Yes. MP4 or MOV."],
      ["Thread (reply chain)", "Yes, up to 25 replies after the first post."],
      ["Photos and videos mixed in one post", "No."],
      ["First comment", "No. Use a thread instead."],
      ["Polls", NOT_YET("X")],
    ],
    sections: [
      {
        heading: "Good to know",
        bullets: ["X takes images up to 5 MB. A larger photo is made smaller for you before it is posted."],
      },
    ],
  },
  {
    slug: "tiktok",
    description: "What SocialReins posts to TikTok: one video or a photo post of up to 35 photos, with a caption and your choice of who sees it.",
    name: "TikTok",
    account: "a TikTok account",
    rows: [
      ["One video", "Yes. MP4 or MOV."],
      ["Photo post", "Yes, 1 to 35 photos. JPEG, PNG or WebP."],
      ["Caption", "Up to 2,200 characters."],
      ["Who can see it", "You choose for every post, from the options your TikTok account offers."],
      ["Text only", "No. TikTok needs a video or photos."],
      ["First comment", "No."],
      ["Video cover image", "Not yet. TikTok only lets a tool pick a frame of the video."],
    ],
    sections: [
      {
        heading: "Good to know",
        bullets: [
          "TikTok asks you to say when a post promotes your own brand or is paid for by another one. The post form has both switches.",
          "A video and photos cannot go in the same post.",
          "Until TikTok finishes its review of SocialReins, TikTok only lets posts go out as private.",
        ],
      },
    ],
  },
];

export const network = (slug: string) => networks.find((n) => n.slug === slug);
