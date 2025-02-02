# GitHub Contributor Analytics Generator

A comprehensive analytics and reporting system for tracking GitHub repository contributions, generating insights, and creating static contributor profile pages.

**elizaos/eliza permalinks**:
- [Daily Contributors](https://elizaos.github.io/data/daily/contributors.json)  
  - [Daily Summary (JSON)](https://elizaos.github.io/data/daily/summary.json)  
  - [Daily Summary (Markdown)](https://elizaos.github.io/data/daily/summary.md)
- [Weekly Contributors](https://elizaos.github.io/data/weekly/contributors.json)
- [Monthly Contributors](https://elizaos.github.io/data/monthly/contributors.json)

Older versions are backed up in the respective `data/*/history` folders with timestamped filenames.

---

## Features

- **Daily, Weekly, and Monthly Reports**
  - Automated data collection via GitHub Actions or manual fetch
  - Detailed activity summaries with metrics and trends
  - Smart contributor scoring system
  - AI-powered summaries for each contributor

- **Contributor Profiles**
  - Interactive profile pages for each contributor
  - Activity visualization with charts and metrics
  - Contribution history and engagement tracking
  - Responsive design with dark mode support

- **Activity Tracking**
  - Pull request analysis (with file-level changes)
  - Issue tracking with label analytics
  - Commit history and code impact measurement
  - Engagement metrics (comments, reviews, reactions)

---

## Setup

1. **Configure Environment Variables**  
   You’ll need a GitHub token and (optionally) an OpenAI API key for AI-generated summaries:
   ```bash
   export GITHUB_TOKEN="your_gh_token"
   export OPENAI_API_KEY="your_openai_key"       # optional if using AI summaries
   ```

2. **Install Python and Node Dependencies**  
   ```bash
   # Python dependencies (if using the Python-based src)
   pip install openai langchain-core langchain-ollama
   
   # Node.js dependencies
   npm install
   ```

3. **Update Repository Details (Optional)**  
   If you’re using the Bash src (`fetch_github.sh`), you may need to adjust:
   ```bash
   # src/fetch_github.sh
   owner="your_org"
   repo="your_repo"
   ```
   Otherwise, the main Orchestrator script reads `owner` and `repo` from environment or `.env` file.

---

## Usage

### 1. Orchestrator-Based Workflow (Preferred)

A single Node script, `src/orchestrator.js`, can handle all steps—fetching data, processing, scoring, summarizing, and generating a static site. You can run it in three ways:

- **Daily**:  
  ```bash
  npm run orchestrate:daily
  ```
- **Weekly**:  
  ```bash
  npm run orchestrate:weekly
  ```
- **Monthly**:  
  ```bash
  npm run orchestrate:monthly
  ```
- **All at once**:  
  ```bash
  npm run orchestrate:all
  ```

Each command will:
1. **Fetch** PRs, issues, and commits for the specified time window.
2. **Combine** the data into a single JSON file.
3. **Calculate scores** for each contributor.
4. **Summarize** the results (optionally via OpenAI).
5. **Generate** or update the static site under `profiles/`.

### 2. Manual Data Collection (Legacy Approach)

If you prefer step-by-step usage (e.g., using the older Python or Bash src directly):

```bash
# Fetch data for the past 7 days
./src/fetch_github.sh your_org your_repo --type prs --days 7
./src/fetch_github.sh your_org your_repo --type issues --days 7
./src/fetch_github.sh your_org your_repo --type commits --days 7

# Combine and process data
node src/combine.js \
  --prs data/daily/prs.json \
  --issues data/daily/issues.json \
  --commits data/daily/commits.json \
  --output data/daily/combined.json

node src/calculate_scores.js \
  data/daily/combined.json \
  data/daily/scored.json

node src/summarize.js \
  data/daily/scored.json \
  data/daily/contributors.json \
  --force  # to overwrite output
```

*(You can similarly run the Python equivalents if you’re using that older pipeline.)*

### 3. Automated Reports via GitHub Actions

A GitHub Actions workflow (`.github/workflows/contributor-updates.yml`) is included. It:
- **Runs daily** (fetches/updates daily data)
- **Runs weekly** on Fridays
- **Runs monthly** on the 4th
- **Commits** any changed JSON/HTML files back to the repo

You can see the current triggers in the `on.schedule` section of [contributor-updates.yml](.github/workflows/contributor-updates.yml).

---

## Generate Static Site

Once data is processed, you can generate a static site of contributor pages:

```bash
# Bundle React components (via esbuild)
npm run build-site

# Generate the HTML pages in `profiles/`
npm run generate-site

# Open main index
open profiles/index.html
```

---

## Data Structure

After scoring and summarizing, each contributor looks like:

```jsonc
{
  "contributor": "username",
  "score": 42,
  "avatar_url": "https://avatars.githubusercontent.com/u/12345",
  "summary": "User is actively refactoring code and adding new features...",
  "activity": {
    "code": {
      "total_commits": 10,
      "total_prs": 3,
      "commits": [/* commit data */],
      "pull_requests": [/* PR data */]
    },
    "issues": {
      "total_opened": 2,
      "opened": [/* issue data */]
    },
    "engagement": {
      "total_comments": 5,
      "comments": [/* comment data */]
      // Optionally "reviews", "reactions", etc.
    }
  }
}
```

---

## Customization

- **Scoring**: See `src/calculate_scores.js` to adjust how commits, PRs, issues, etc. are weighted.  
- **Summaries**: See `src/summarize.js` for custom prompts or different language models.  
- **Profile Pages**: Modify or restyle `src/components/ContributorProfile.js` to tweak the rendered HTML/CSS.  
- **Workflow**: Tweak schedule or steps in `.github/workflows/contributor-updates.yml`.

---

## Directory Structure

```
.
├── data/
│   ├── daily/
│   │   ├── prs.json
│   │   ├── issues.json
│   │   ├── commits.json
│   │   ├── combined.json
│   │   └── contributors.json
│   ├── weekly/
│   └── monthly/
├── profiles/                # Generated static site
├── src/
│   ├── orchestrator.js      # Main script orchestrating everything
│   ├── calculate_scores.js
│   ├── summarize.js
│   ├── fetch_github.js
│   ├── combine.js
│   ├── build.js             # Bundles React with esbuild
│   ├── generate_site.js     # Outputs static HTML per contributor
│   └── components/
│       └── ContributorProfile.js
└── .github/workflows/
    └── contributor-updates.yml
```

---

## Requirements

- **Python 3.11+** (if using older Python src)
- **Node.js 18+**
- **GitHub Personal Access Token**: `$GITHUB_TOKEN`
- **OpenAI API Key** *(optional for AI summaries)*: `$OPENAI_API_KEY`

---

Happy analyzing! If you have any questions, feel free to join the [Discord](https://discord.gg/elizaOS) community.

## TODO

- Evaluate closed PRs and issues. If there are comments, analyze why they were closed and give them a score, potentially reducing the score.

- Evaluate PR quality-- a single commit PR could be squashed, which would be a good thing.

- Evaluate PR size-- ultra-small PRs get few points, since they are quick. Really large PRs get few points, since they are hard to review.

- Add scenarios with expected point range for different types of issues, PRs, commits and interactions.

- Assess if they user is trying to game the system or if they are contributing in a way that is not sustainable.