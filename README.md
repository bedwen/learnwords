# LearnWords

LearnWords is a local-first, distraction-free English vocabulary acquisition platform built with spaced repetition system (SRS) algorithms, context-driven sentence translation practice, and cognitive ergonomics.

The platform is designed to provide a calm, tactile, and highly effective learning environment that respects user privacy and data ownership. It operates entirely offline with zero third-party cloud dependencies.

---

## Overview Showcase

LearnWords features a dual-theme interface engineered around cognitive ergonomics and reading comfort: **Warm Vellum** (natural book page tone) for daytime clarity and **Nocturnal Study** (deep botanical slate) for low-light focus.

### Home Dashboard
The central dashboard provides daily study queues, a 90-day study consistency heatmap, a unified stat ribbon, and a CEFR proficiency breakdown.

![Home Dashboard](./imagesforreadme/home_split.png)

### Spaced Repetition Study & Sentence Practice
Interactive 3D flashcards with tactile card stack depth, keyboard navigation, and bidirectional sentence translation practice.

![Study Session](./imagesforreadme/study_split.png)

---

## Core Features

### Cognitive Ergonomics & Design System
- **Warm Vellum & Nocturnal Study Themes:** Purpose-crafted color tokens (#F9F7F2 light / #141716 dark) designed to reduce glare and visual fatigue during prolonged reading sessions.
- **De-Weaponized SRS Rating Colors:** Replaces stressful high-contrast traffic-light colors with psychologically calming tones: warm terracotta for *Again*, amber ochre for *Hard*, eucalyptus sage for *Good*, and slate cerulean for *Easy*.
- **Tactile Micro-Geometry:** Organic contours (rounded cards, pill capsules) and dynamic deck depth indicators where background card layers visibly diminish as cards are cleared.
- **Literary Dual-Coding:** Contextual example sentences rendered with serif typography to reinforce memory encoding as literary excerpts rather than sterile UI text.

### Spaced Repetition System (SRS)
- **Deterministic Scheduling:** Based on proven spaced intervals (1 day, 3 days, 7 days, 14 days, 30 days, 90 days, 180 days, 365 days).
- **Five-Stage Mastery Progression:** Words advance through distinct stages: *New*, *Learning*, *Familiar*, *Strong*, and *Mastered*.
- **Domain Layer Separation:** Spaced repetition calculations live strictly in the domain logic layer, decoupled from UI rendering components.

### Bidirectional Sentence Translation Practice
- **Contextual Recall:** Practice vocabulary in complete sentences rather than isolated words.
- **Dual Direction Modes:** Freely toggle between `Sentence -> Translation` and `Translation -> Sentence`.
- **Active Retrieval:** Integrated input field for typing answers before revealing the canonical sentence.
- **Unified Review State:** Sentence reviews update the same SRS intervals and learning states as flashcard reviews.

### Vocabulary Organization & Multi-Folder Management
- **Topic Folders:** Categorize words into custom-colored collections (e.g., Travel, Business, Academic, Idioms).
- **Multi-Folder Tagging:** A single word can belong to multiple folders simultaneously.
- **Advanced Filtering & Search:** Instant search across headwords, definitions, and personal notes, with filtering by CEFR level (A1 to C2) and mastery status.
- **Batch Operations:** Move, change CEFR levels, or remove multiple words in bulk.

![Vocabulary Folders](./imagesforreadme/words_folders.png)

![Words Management Table](./imagesforreadme/words_table.png)

### Non-Destructive Trash Bin & Safe Restoration
- **Accidental Deletion Protection:** Deleted words are placed in the Trash Bin rather than permanently purged.
- **Complete State Preservation:** Restoring words preserves all review logs, interval steps, mastery states, and folder memberships.
- **Controlled Purge:** Option to restore or permanently delete individual words, or safely empty the trash bin.

### Flexible Creation Modals
Quickly organize study materials through dedicated creation workflows.

![Create Folder](./imagesforreadme/folder_add_modal.png)

![Add Word](./imagesforreadme/word_add_modal.png)

### In-Depth Learning Statistics
- **Activity Heatmap:** 13-week (90-day) calendar displaying daily review intensity and persistence.
- **CEFR Distribution:** Visual breakdown of vocabulary across CEFR difficulty levels (A1, A2, B1, B2, C1, C2).
- **Retention & Accuracy Metrics:** Total reviews, pass rates, recall accuracy, and recent submission logs.

![Learning Statistics](./imagesforreadme/statistics.png)

### Data Management & Backups
- **CSV Import & Export:** Bulk import words from spreadsheets with automated duplicate detection, and export filtered lists.
- **Full JSON Backups:** Complete database snapshot backup and restore capability to ensure your learning progress is always safe.

![Data Management](./imagesforreadme/data_management.png)

---

## Technology Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons
- **Backend:** Node.js, Express
- **Database:** SQLite (`better-sqlite3`) in WAL mode for fast, zero-config local persistence
- **Testing & Verification:** Vitest (automated test suite) and automated security audits

---

## Getting Started

### Prerequisites
- Node.js v18 or later
- npm v9 or later

### Installation

1. Clone the repository:
```bash
git clone https://github.com/bedwen/learnwords.git
cd learnwords
```

2. Install dependencies:
```bash
npm install
```

### Running Locally

Start both the backend server and frontend development server:
```bash
npm run dev
```

Open your browser at `http://localhost:5173`.

### Production Build

Compile TypeScript and build optimized assets:
```bash
npm run build
```

Run backend server against built assets:
```bash
npm start
```

### Running Tests

Execute the automated test suite:
```bash
npm test
```

Execute the security and database isolation audit:
```bash
node .agents/skills/security/scripts/audit.cjs
```

---

## License

This project is licensed under the MIT License.
