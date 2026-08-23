# User Flow Document
## Spotiwind — *Feel the Music, Ride the Wind*

| Field | Detail |
|---|---|
| **Product** | Spotiwind — Music Streaming Platform |
| **Document Type** | User Flows & Journey Maps |
| **Version** | 1.0 |
| **Last Updated** | August 22, 2026 |
| **Status** | Draft — Ready for Design & Engineering Handoff |
| **Related Documents** | `PRD.md` · `DESIGN.md` · `DATABASE.md` · `SKILL.md` |

> Diagrams below use Mermaid flowchart syntax and render natively in GitHub, GitLab, Notion, Obsidian, and most modern Markdown viewers/IDE extensions.

---

## Table of Contents
1. [Legend](#1-legend)
2. [New User Onboarding](#2-new-user-onboarding)
3. [Returning User Login](#3-returning-user-login)
4. [Discovery & First Play](#4-discovery--first-play)
5. [Search](#5-search)
6. [Playlist Creation & Management](#6-playlist-creation--management)
7. [Following an Artist](#7-following-an-artist)
8. [Upgrading to Premium](#8-upgrading-to-premium)
9. [WindFlow Radio](#9-windflow-radio)
10. [Cross-Device Continuity](#10-cross-device-continuity)
11. [Artist Upload Flow](#11-artist-upload-flow)
12. [Offline Download (Premium)](#12-offline-download-premium)
13. [Account & Subscription Settings](#13-account--subscription-settings)
14. [Wind Rewind (Annual Recap)](#14-wind-rewind-annual-recap)
15. [Error & Edge Cases](#15-error--edge-cases)
16. [Site Map / Information Architecture](#16-site-map--information-architecture)

---

## 1. Legend

| Shape | Meaning |
|---|---|
| `[Rectangle]` | Screen or system action |
| `{Diamond}` | Decision point |
| `([Rounded])` | Start / end of flow |
| `-->\|label\|` | Transition, labeled with the triggering action |

---

## 2. New User Onboarding

Corresponds to `PRD.md FR-AUTH.1–FR-AUTH.2`.

```mermaid
flowchart TD
    Start([Landing Page]) --> Guest{Sign up or\ncontinue as guest?}
    Guest -->|Continue as guest| Preview[Limited catalog preview]
    Preview -->|Prompted after 2 tracks| SignUp
    Guest -->|Sign up| SignUp[Sign Up Screen]
    SignUp --> Method{Method}
    Method -->|Email| EmailForm[Enter email + password]
    Method -->|Google / Apple| OAuth[OAuth consent]
    EmailForm --> Verify[Verify email]
    OAuth --> Genres
    Verify --> Genres[Choose 3+ genres]
    Genres --> Artists[Choose 3+ artists]
    Artists --> Home([Personalized Home Feed])
```

**Design intent** (`DESIGN.md §15`): the genre/artist selection screens use the wind-trail entrance animation per selection, so the onboarding itself already *feels* like the brand before the user has played a single track.

---

## 3. Returning User Login

```mermaid
flowchart TD
    Start([Open App]) --> Session{Valid session\ntoken?}
    Session -->|Yes| Home([Home Feed])
    Session -->|No| Login[Login Screen]
    Login --> Method{Method}
    Method -->|Email + Password| Creds[Enter credentials]
    Method -->|Google / Apple| OAuth[OAuth flow]
    Creds --> Check{Valid?}
    Check -->|No| Error[Show inline error,\nremain on Login]
    Check -->|Yes| Home
    OAuth --> Home
    Login --> Forgot[Forgot password?]
    Forgot --> ResetEmail[Send reset link]
    ResetEmail --> ResetForm[Set new password]
    ResetForm --> Login
```

---

## 4. Discovery & First Play

Corresponds to `PRD.md FR-HOME.1`, `FR-PLAYER.1`.

```mermaid
flowchart TD
    Home([Home Feed]) --> Browse[Scroll shelves:\nWindFlow picks, Made for You,\nNew Releases]
    Browse --> Select[Tap a track / album / playlist]
    Select --> MiniPlayer[Mini-player docks at bottom,\nBreeze Transition in]
    MiniPlayer --> Expand{Expand to\nfull player?}
    Expand -->|Tap bar| Full[Full-screen Now Playing]
    Expand -->|Continue browsing| Home
    Full --> Controls[Play/Pause, Seek, Queue,\nLyrics toggle]
    Controls --> NextTrack[Track ends]
    NextTrack --> Auto[Autoplay next via\nBreeze Transition]
    Auto --> Controls
```

---

## 5. Search

Corresponds to `PRD.md FR-SEARCH.1–FR-SEARCH.2`.

```mermaid
flowchart TD
    Start([Tap Search tab]) --> Empty[Empty state:\nbrowse-by-mood genre chips]
    Empty --> Type[User types query]
    Type --> Suggest{2+ characters?}
    Suggest -->|Yes| LiveResults[Live suggestions appear]
    Suggest -->|No| Type
    LiveResults --> Submit[Submit search]
    Submit --> Tabs[Categorized results:\nTracks / Artists / Albums / Playlists]
    Tabs --> Filter[Optional: filter by\ngenre, year, duration]
    Tabs --> SelectResult[Tap a result]
    SelectResult --> Detail[Track / Artist / Album / Playlist detail]
```

---

## 6. Playlist Creation & Management

Corresponds to `PRD.md FR-PL.1–FR-PL.4`.

```mermaid
flowchart TD
    Start([Library]) --> Create[Tap 'Create Playlist']
    Create --> Name[Name + optional cover image]
    Name --> Empty[New empty playlist screen]
    Empty --> AddTracks[Search / browse to add tracks]
    AddTracks --> Reorder[Drag to reorder]
    Reorder --> Visibility{Set visibility}
    Visibility -->|Private| Done1([Saved — private])
    Visibility -->|Public / Unlisted| Share[Share via link\nor to followers]
    Share --> Collab{Enable\ncollaboration?}
    Collab -->|Yes| Invite[Invite collaborators —\nbecomes a Tailwind Playlist]
    Collab -->|No| Done2([Saved])
    Invite --> LiveEdit[Real-time shared editing,\nper-track attribution]
```

---

## 7. Following an Artist

```mermaid
flowchart TD
    Start([Artist Profile Page]) --> Follow[Tap Follow]
    Follow --> Confirm[Button state changes\nto 'Following']
    Confirm --> Notify{New release\nby this artist?}
    Notify -->|Yes| Push[Push + in-app notification]
    Push --> HomeShelf[Surfaces in\n'New from artists you follow']
```

---

## 8. Upgrading to Premium

Corresponds to `PRD.md §10.1`, `FR-SET.2`.

```mermaid
flowchart TD
    Trigger{Upgrade trigger} -->|Hits skip limit| Prompt
    Trigger -->|Taps ad-free banner| Prompt
    Trigger -->|Visits Settings > Plan| Prompt[Pricing screen:\nFree vs Premium tiers]
    Prompt --> Choose[Select a plan]
    Choose --> Payment[Enter payment method:\ncard, GoPay, OVO, QRIS]
    Payment --> Process{Payment\nsucceeds?}
    Process -->|No| Retry[Show reason,\noffer retry / different method]
    Retry --> Payment
    Process -->|Yes| Confirm[Confirmation screen +\nreceipt email]
    Confirm --> Unlocked([Ads removed, offline unlocked,\nquality upgraded immediately])
```

---

## 9. WindFlow Radio

Corresponds to `PRD.md FR-HOME.2` — the product's signature discovery loop.

```mermaid
flowchart TD
    Seed{Start from} -->|A track| StartA[Tap 'Start WindFlow Radio']
    Seed -->|An artist| StartB[Tap 'Start WindFlow Radio']
    Seed -->|A mood, via Windmap| StartC[Select a node on Windmap]
    StartA --> Queue[Continuous queue generated\nfrom BPM / energy / genre similarity]
    StartB --> Queue
    StartC --> Queue
    Queue --> Play[Playback begins,\nBreeze Transitions between tracks]
    Play --> Feedback{User action\nduring playback}
    Feedback -->|Like| Refine[Queue leans further\ntoward this direction]
    Feedback -->|Skip| Refine2[Queue steers away\nfrom this direction]
    Feedback -->|No action| Continue[Queue continues unchanged]
    Refine --> Play
    Refine2 --> Play
    Continue --> Play
```

---

## 10. Cross-Device Continuity

```mermaid
flowchart TD
    A([Playing on Device A]) --> State[Now-playing state written\nto Redis + synced via WebSocket]
    State --> OpenB[User opens Spotiwind\non Device B]
    OpenB --> Detect{Active session\non another device?}
    Detect -->|Yes| Banner["Continue listening' banner shown"]
    Detect -->|No| NormalHome[Normal Home Feed]
    Banner --> Tap[User taps banner]
    Tap --> Handoff[Playback resumes on Device B\nat exact position,\nDevice A pauses]
```

---

## 11. Artist Upload Flow

Corresponds to `PRD.md FR-ART.1`.

```mermaid
flowchart TD
    Start([Artist Dashboard]) --> New[Tap 'Upload']
    New --> Type{Single or Album?}
    Type -->|Single| SingleForm[Upload audio file +\ntitle, genre, cover art]
    Type -->|Album| AlbumForm[Create album shell,\nthen add tracks one by one]
    SingleForm --> Meta[Enter metadata:\ncredits, explicit flag, release date]
    AlbumForm --> Meta
    Meta --> QualityCheck[Automated audio/loudness check]
    QualityCheck --> Pass{Passes checks?}
    Pass -->|No| FixIssues[Flag specific issue,\nreturn to upload]
    Pass -->|Yes| Review[Preview listing]
    Review --> Publish[Publish]
    Publish --> Live([Live on catalog,\nnotifies followers])
```

---

## 12. Offline Download (Premium)

```mermaid
flowchart TD
    Start([Album or Playlist page]) --> Check{User is\nPremium?}
    Check -->|No| Paywall[Prompt: 'Offline listening\nis a Premium feature']
    Paywall --> Upgrade[Link to Upgrade flow, §8]
    Check -->|Yes| Toggle[Tap download toggle]
    Toggle --> Downloading[Progress indicator\nper track]
    Downloading --> Stored([Available in\n'Downloaded' library view])
    Stored --> Manage[Storage usage shown in Settings,\nremovable per item]
```

---

## 13. Account & Subscription Settings

```mermaid
flowchart TD
    Start([Settings]) --> Sections{Section}
    Sections -->|Profile| Profile[Edit display name,\navatar, connected accounts]
    Sections -->|Playback| Playback[Streaming quality,\ncrossfade length, explicit filter]
    Sections -->|Plan & Billing| Plan[View current plan]
    Sections -->|Privacy| Privacy[Private session toggle,\ndata export / delete request]
    Plan --> Change[Change plan]
    Plan --> Cancel[Cancel subscription]
    Cancel --> Retention[Retention offer shown]
    Retention --> Confirm{Confirm cancel?}
    Confirm -->|Yes| Canceled([Reverts to Free\nat period end])
    Confirm -->|No| Plan
```

---

## 14. Wind Rewind (Annual Recap)

```mermaid
flowchart TD
    Trigger([Annual recap period opens]) --> Notify[Push notification:\n'Your Wind Rewind is ready']
    Notify --> Open[User opens Wind Rewind]
    Open --> Story[Full-screen story-format recap:\ntop tracks, artists, genres, minutes listened]
    Story --> Share{Share?}
    Share -->|Yes| Card[Generate branded shareable card\nwith Windstream gradient background]
    Share -->|No| Done([Return to Home])
    Card --> External[Share to external platforms]
```

---

## 15. Error & Edge Cases

```mermaid
flowchart TD
    Playback([Track playing]) --> NetLoss{Network lost\nmid-playback?}
    NetLoss -->|Yes, buffer available| Buffered[Continue from local buffer,\nshow subtle offline indicator]
    NetLoss -->|Yes, no buffer| Paused[Pause playback,\nclear inline message + retry action]
    NetLoss -->|No| Playback
    Paused --> Reconnect{Connection\nrestored?}
    Reconnect -->|Yes| Resume[Auto-resume from\nexact paused position]
    Reconnect -->|No| Paused

    PayFail([Payment fails during upgrade]) --> Reason[Show specific reason\n'card declined' / 'insufficient funds']
    Reason --> Options[Offer retry, different method,\nor stay on Free]
```

---

## 16. Site Map / Information Architecture

```mermaid
flowchart TD
    Root([Spotiwind]) --> Home
    Root --> Search
    Root --> Library
    Root --> NowPlaying[Now Playing]
    Root --> ArtistDash[Artist Dashboard\n(artist role only)]
    Root --> Settings

    Home --> Shelf1[WindFlow Picks]
    Home --> Shelf2[Made for You]
    Home --> Shelf3[New Releases]
    Home --> Windmap

    Library --> LikedSongs[Liked Songs]
    Library --> Playlists
    Library --> SavedAlbums[Saved Albums]
    Library --> FollowedArtists[Followed Artists]
    Library --> Downloaded

    NowPlaying --> Queue
    NowPlaying --> Lyrics
    NowPlaying --> WindFlowRadio[Start WindFlow Radio]

    Settings --> Profile
    Settings --> PlanBilling[Plan & Billing]
    Settings --> Privacy
    Settings --> Notifications
```

---
*End of USER-FLOW.md — this closes the documentation set alongside `PRD.md`, `DESIGN.md`, `DATABASE.md`, and `SKILL.md`.*
