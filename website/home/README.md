# MatchNice Home on Wix: text + embeds kit (v1.0.0, Nov 4 2026)

**How this stays easy to edit:** every word a visitor reads is a normal Wix text box or button. You edit it in the Wix Editor and publish. Only the two animations are code (Embed HTML boxes). Those rarely change and are kept, with version numbers, in GitHub (`sol-hq` repo, `website/home/`).

- **Text change:** click the text in the Wix Editor, type, Publish. No prompt, no developer.
- **Undo a text change:** Wix Editor top bar > **Site** > **Site History** > pick an earlier version > **Restore**.
- **Animation change:** ask Sol or the Velo developer. The file's version goes up (1.0.0 to 1.1.0), the change goes through a GitHub pull request, then the new file is pasted into the same Embed HTML box.
- No Dev Mode or Velo code is needed for this page.

Layout rule: on desktop, text and visual share the row half and half. On mobile, Wix stacks them: text first, then the visual.

---

## Section 1: Hero (white)

Desktop: two columns, half and half. Mobile: text, then the embed, then the three steps.

**Left column, top to bottom**
| Element | Wix style | Text | Link |
| --- | --- | --- | --- |
| Small label | Heading 6 | Personalized matching for nonprofits | |
| Headline | Heading 1 | We run your matching campaign end to end. | |
| Line | Paragraph 1 | Not one-size-fits-all. Bring us in for the whole campaign or just the part you need. | |
| Main button | Primary button (Midnight) | Create account | Sign-up page (see note A) |
| Text link | Paragraph 2, Deep Blue link | Take the Match Readiness Check | /readiness |
| Small line | Paragraph 3 | Free to create an account. Already have one? Sign in. | "Sign in" links to the login page |
| Three ticks | Paragraph 2 | ✓ Launch a new match<br>✓ Add a match to a campaign you run<br>✓ Amplify a match that is working | |

**Right column**
1. Embed HTML box with `embeds/hero-steps.html`. Size: desktop 560 wide x 450 high; mobile 320 x 430.
2. Under it, three short text lines (Paragraph 3), so the steps are real, editable text:
   - **1 Find your Matcher.** MatchID ranks your own donors to show who is most likely to fund your match.
   - **2 Make the match visible.** The match shows on your giving page, at checkout and in donor messages, so every gift counts twice.
   - **3 Track and share impact.** Every matched gift is tracked, and one report goes to your board, your Matcher and your donors.

## Section 2: What you told us (Mist background)

| Element | Wix style | Text |
| --- | --- | --- |
| Small label | Heading 6 | What 208 fundraisers told us |
| Headline | Heading 2 | We asked. Here's what you said. |

Three columns on desktop (stacked on mobile). Each column, top to bottom:

| Big number (Heading 1, MatchNice pink #AD1F76) | Label (Heading 4) | "WHAT WE DO" (Heading 6, Emerald) | Answer (Paragraph 2) |
| --- | --- | --- | --- |
| 42% | find it hard to find a Matcher | What we do | Step 1: MatchID finds likely Matchers in your own donors. |
| 32% | say donors don't know about the match | What we do | Step 2: the match shows everywhere your donors give. |
| 32% | don't have the time | What we do | We run it end to end, taking about 23.5 to 43 hours off your team's plate. Step 3 tracks and reports every gift. |

Under the columns:
- Source (Paragraph 3): State of Donation Matching 2025, p.8, n=208: 27 MatchNice survey responses plus 181 from a Centiment panel, Feb–Apr 2025.
- Text link (Paragraph 2): Which one is yours? Take the 3-minute Match Readiness Check → links to /readiness

## Section 3: Proof (white)

| Element | Wix style | Text |
| --- | --- | --- |
| Small label | Heading 6 | Proof |
| Headline | Heading 2 | We know matching works. |

Two cards side by side (stacked on mobile):

| Card | Big number (Heading 1, Emerald) | Line (Heading 4) | Small text (Paragraph 3) | Link |
| --- | --- | --- | --- | --- |
| Research | 22% | more people gave when a match was offered | Karlan and List, American Economic Review (2007) | |
| Customer | +64% | online revenue, year over year | Boys & Girls Clubs of America, with Maytag's $75,000 match in its fifth year | Read the customer stories → (your case studies page) |

## Section 4: MatchID (Mist background)

Desktop: two columns, half and half. Mobile: text, then the embed.

| Element | Wix style | Text | Link |
| --- | --- | --- | --- |
| Small label | Heading 6 | MatchID | |
| Headline | Heading 2 | Your donors aren't one audience. | |
| Line | Paragraph 1 | Send your donor file, no names. MatchID finds your likely Matchers and builds a match for each audience. | |
| Button | Primary button | Request your MatchID | See note B |

Right column: Embed HTML box with `embeds/matchid-card.html`. Size: desktop 520 x 360; mobile 320 x 430.

## Section 5: Close (white, centered)

| Element | Wix style | Text | Link |
| --- | --- | --- | --- |
| Headline | Heading 2 | We run your matching campaign end to end. | |
| Line | Paragraph 1 | Or just the part you need. It works alongside what you already do. | |
| Main button | Primary button | Create account | Sign-up page (note A) |
| Text link | Paragraph 2 | See how it works | Your how-it-works / product page |

## Page SEO (Wix: Pages > Home > ... > SEO basics)
- Title: Matching Campaigns for Nonprofits, Run End to End | MatchNice
- Description: MatchNice finds your Matcher, makes the match visible everywhere donors give, and reports every gift. Use us end to end or for any part.

## Notes and open items
- **A. Sign-up link:** use the link your current sign-up button uses until ib confirms the final sign-up page and that creating an account is free.
- **B. MatchID button:** there is no MatchID page yet. Until there is, link it to your contact page or an email to connect@matchnice.org.
- **C. Header button:** the site header still says "Start for $299". Changing it to "Create account" changes every page, so it's Pooya's call.
- **D. Hours line:** "23.5 to 43 hours" is the Readiness Check's estimate of what a nonprofit does alone (Pooya chose it for the site on Nov 2). It is not yet checked against real campaigns.
- Embed sizes are tested in a browser at 560, 400 and 320 px wide. How Wix sizes them on mobile is not tested here: check Preview on mobile and adjust the box height if there is a gap or a scrollbar.

## Embed files
| File | Version | What it shows |
| --- | --- | --- |
| embeds/hero-steps.html | 1.0.0 | 1-2-3 carousel: Find (MatchID list), Go live (giving page with 2X banner), Report (match report). Auto-advances every 5 s, stops when touched, still frame for reduced motion. Sample data. |
| embeds/matchid-card.html | 1.0.0 | MatchID sample plan: three audiences, each with its own match ask. Animates when scrolled into view. |
