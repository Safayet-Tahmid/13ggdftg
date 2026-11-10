# Space Apps 2026: eligibility notes on pre-event work

Checked 10 to 11 November 2026. Overall status: **NEEDS ORGANIZER CONFIRMATION**.

This is not legal advice and not a ruling. Only the organisers can confirm eligibility.

## 1. What was checked

| Source | What it says on this question | Type |
| --- | --- | --- |
| NASA Space Apps 2026 Participant FAQ, https://www.spaceappschallenge.org/resources/participant-faqs/ (dated 17 Jul 2026) | Event dates 14 to 15 Nov 2026. It does not address when work may start, pre-existing code, AI use or third-party libraries | Official, 2026 |
| NASA Space Apps 2024 Participant FAQ (copies found via search) | Teams may begin working at 9:00 a.m. local time on the first event day. A 2024 kickoff deck adds that participants are not permitted to start working on solutions before the event | Official but 2024. Not confirmed for 2026 |
| Bangladesh Participants Guide and Build Guide (shared by the team on 13 Oct, summarised in the project file `SHIFT_RULES_2026.md`) | Bangladesh runs 13 to 14 Nov. Prescreening Video 1 (solution concept) before the event. Video 2 with a working demo due 18:30 on day 1. Teams arrive with a GitHub repository ready. Every AI tool must be named with its prompts and reasoning | Local guide. Not checked again today |
| Project Submission Guide and Judging and Awards Guide 2026 | Publish on 13 Nov 2026. Not available yet | Pending |

## 2. Confirmed, interpretation, unresolved

Confirmed:
- 2026 event dates (global 14 to 15 Nov, Bangladesh 13 to 14 Nov).
- The Bangladesh process requires a working demo by 18:30 on day 1, which implies preparation before the event.
- AI tools must be disclosed (Bangladesh guide, and the "Use of AI" field on the NASA project page).

Interpretation (not confirmed):
- The 2024 "do not start before the event" rule may still apply in 2026. The 2026 FAQ is silent.
- The local process and that rule pull in different directions. Only the organisers can say how the judges treat a project built over several weeks.

Unresolved questions for the organisers:
1. Is a project whose code and data processing were built before 13 Nov eligible for local and global judging?
2. If yes, what disclosure is required (timeline, commit history, what was done during the event)?
3. Are AI coding assistants acceptable when disclosed in the "Use of AI" field and in `docs/AI_USE.md`?
4. Does the recent-detections layer planned for 13 to 14 Nov count as event work?

## 3. What SHIFT does regardless of the answer

- Keep the full commit history. Never create a fresh repository or rewrite dates.
- Add a plain timeline to the README and the NASA project page: v1 prototype (Florida), rebuild from 11 Oct, data freeze 9 Nov, globe 10 Nov, event work 13 to 14 Nov.
- Make the event work real and visible as commits dated 13 to 14 Nov.
- Keep `docs/AI_USE.md` current: Claude wrote and tested code, Gemini and ChatGPT tutored. Team decisions, runs and videos are the team's own.
- Third-party libraries (React, MapLibre, pandas and others) are listed in `package.json` and `requirements.txt` with their licences. Natural Earth and NASA GIBS are credited on the Method page.

## 4. Draft message to the organisers (not sent)

To: Dhaka Local Lead (contact in the Bangladesh Participants Guide) or the Bangladesh Space Apps Slack.

> Subject: Team Squadron Zero, Challenge 9: question about work done before the event
>
> Dear organisers,
>
> We are Team Squadron Zero (Challenge 9, Harmonization of MODIS and VIIRS Hot Spots). Before the event we followed the Participants Guide and prepared our solution: a Florida prototype, then a data pipeline that puts 2002 to 2026 FIRMS hotspots on one scale, and a public website. All of it is in our public GitHub repository with the full commit history. We used AI coding assistants (Claude for code, Gemini and ChatGPT as tutors) and record this in docs/AI_USE.md.
>
> During the event (13 to 14 November) we plan to add a recent-detections layer from NASA FIRMS (NOAA-20 and NOAA-21 VIIRS) and to prepare Videos 2 and 3.
>
> Could you confirm that a project prepared this way is eligible for local and global judging, and tell us what disclosure you would like (for example a timeline on the project page)?
>
> Thank you,
> Team Squadron Zero

Do not send without Squadron Zero's approval.
