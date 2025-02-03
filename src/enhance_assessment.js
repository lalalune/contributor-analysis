#!/usr/bin/env node
// enhance_assessment.js

import fs from 'fs/promises';
import { OpenAI } from 'openai';
import { config } from 'dotenv';
config();

//
// Ensure the OPENAI_API_KEY is set
//
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("Error: OPENAI_API_KEY environment variable is required.");
  process.exit(1);
}

// Initialize the OpenAI client (using GPT‑4o‑mini; change model as needed)
const openai = new OpenAI({ apiKey });

//
// Global array to store few-shot examples
//
let previousExamples = [];

/**
 * Randomly select up to max examples from the array.
 * @param {Array} examples - The array of example objects.
 * @param {number} max - Maximum number of examples to select.
 * @returns {Array} Selected examples.
 */
function selectFewShotExamples(examples, max = 5) {
  const shuffled = examples.slice().sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(max, examples.length));
}

/**
 * Compress the contributor’s activity data to reduce token usage.
 * Only keep totals and a few top items from each section.
 */
function compressContributorData(contributor) {
  // Create a shallow copy of contributor data.
  const compressed = { ...contributor };

  const activity = contributor.activity || {};
  const code = activity.code || {};
  const issues = activity.issues || {};
  const engagement = activity.engagement || {};

  compressed.activity = {
    code: {
      total_commits: code.total_commits || 0,
      total_prs: code.total_prs || 0,
      // Only include the top 5 pull requests
      pull_requests: (code.pull_requests || []).slice(0, 5).map(pr => ({
        number: pr.number,
        title: pr.title,
        state: pr.state,
        merged: pr.merged,
        created_at: pr.created_at
      })),
      // Only include the top 5 commits
      commits: (code.commits || []).slice(0, 5).map(commit => ({
        sha: commit.sha,
        message: commit.message,
        created_at: commit.created_at
      }))
    },
    issues: {
      total_opened: issues.total_opened || 0,
      // Only include the top 5 issues
      opened: (issues.opened || []).slice(0, 5).map(issue => ({
        number: issue.number,
        title: issue.title,
        state: issue.state,
        created_at: issue.created_at
      }))
    },
    engagement: {
      total_comments: engagement.total_comments || 0,
      total_reviews: engagement.total_reviews || 0
    }
  };

  // Optionally, trim overly long summary text.
  if (compressed.summary && compressed.summary.length > 1000) {
    compressed.summary = compressed.summary.slice(0, 1000) + '...';
  }

  return compressed;
}

/**
 * Augment contributor data with additional contextual metrics.
 * In a real system, these could be derived from external tools.
 */
function augmentContributorData(contributor) {
  // Compute a collaboration score from reviews, comments, and merged PRs.
  const reviews = contributor.activity?.engagement?.total_reviews || 0;
  const comments = contributor.activity?.engagement?.total_comments || 0;
  const mergedPRs = (contributor.activity?.code?.pull_requests || [])
    .filter(pr => pr.merged).length;
  contributor.collaborationScore = reviews * 0.5 + comments * 0.2 + mergedPRs * 1.0;

  // Historical trend: placeholder using overall score.
  contributor.historicalTrend = contributor.score || 0;

  // Dummy static analysis score (or use real metrics if available).
  contributor.staticAnalysisScore = contributor.staticAnalysisScore || 75;

  // Dummy network score (or use network analysis data).
  contributor.networkScore = contributor.networkScore || 50;

  return contributor;
}

/**
 * Create an enhanced prompt for evaluating a contributor.
 * The prompt includes:
 * - Basic info, extra contextual metrics,
 * - Compressed activity data,
 * - The contributor's summary, and
 * - Optionally, a few-shot examples from previous assessments.
 */
function createAssessmentPrompt(compressedContributor, fewShotExamples = []) {
  let prompt = `
You are an expert evaluator of GitHub contributions with deep insight into both quantitative metrics and qualitative impact.
Below is the aggregated data for a contributor. The data includes:

**Basic Information:**
- **Name:** ${compressedContributor.contributor}
- **Overall Score:** ${compressedContributor.score}

**Additional Context:**
- **Collaboration Score:** ${compressedContributor.collaborationScore} (derived from reviews, comments, and merged PRs)
- **Historical Trend:** ${compressedContributor.historicalTrend} (indicative of consistent performance over time)
- **Static Analysis Score:** ${compressedContributor.staticAnalysisScore} (code quality metrics)
- **Network Score:** ${compressedContributor.networkScore} (based on peer interactions)

**Compressed Activity Details:**  
\`\`\`json
${JSON.stringify(compressedContributor.activity, null, 2)}
\`\`\`

**Summary of Recent Contributions:**  
${compressedContributor.summary || "No summary provided."}
`;

  if (fewShotExamples && fewShotExamples.length > 0) {
    prompt += "\n\nFew-shot Examples (previous contributor assessments):\n";
    prompt += "```json\n" + JSON.stringify(fewShotExamples, null, 2) + "\n```";
  }

  prompt += `
  
Based on the above data, please provide an overall assessment of the contributor’s value to the project. Your assessment must include:
1. A rating on a scale from 1 to 10 (10 indicating exceptional value).
2. A concise explanation (1–3 sentences) justifying the rating. Consider factors such as:
   - The quality and quantity of pull requests (including code quality, squashing, deletion bonuses, and discussion quality),
   - Effectiveness in handling issues and commits,
   - Evidence of collaboration and coordination,
   - Consistency over time,
   - Signals from static analysis or network interactions.

Output only valid JSON in the following format:
{
  "rating": <number>,
  "assessment": "<short explanation>"
}
`;
  return prompt;
}

/**
 * Use GPT‑4o‑mini to assess a contributor based on the enhanced prompt.
 * Accepts an optional fewShotExamples parameter.
 */
async function assessContributor(contributor, fewShotExamples = []) {
  const compressedContributor = compressContributorData(contributor);
  const prompt = createAssessmentPrompt(compressedContributor, fewShotExamples);
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a technical evaluator of GitHub contributions." },
        { role: "user", content: prompt }
      ],
      temperature: 0.5,
      max_tokens: 150
    });
    const content = response.choices[0].message.content;
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error assessing contributor ${contributor.contributor}:`, error);
    return { rating: 0, assessment: "Assessment could not be determined due to an error." };
  }
}

/**
 * Perform an ensemble assessment by calling the LLM multiple times and averaging the results.
 * @param {Object} contributor - The contributor data.
 * @param {number} attempts - Number of LLM calls to average.
 * @param {Array} fewShotExamples - Array of few-shot examples to include.
 */
async function ensembleAssessContributor(contributor, attempts = 3, fewShotExamples = []) {
  let totalRating = 0;
  let assessments = [];
  for (let i = 0; i < attempts; i++) {
    const result = await assessContributor(contributor, fewShotExamples);
    totalRating += result.rating;
    assessments.push(result.assessment);
  }
  const averageRating = totalRating / attempts;
  const combinedAssessment = assessments.join(" / ");
  return { rating: averageRating, assessment: combinedAssessment };
}

/**
 * Process all contributors:
 * - Load contributor data.
 * - For each contributor, augment the data,
 *   then select a few-shot context from previous examples (if available),
 *   perform an ensemble assessment,
 *   and store a simplified example for future prompts.
 * - Save the updated data to a new JSON file.
 */
async function assessAllContributors(inputFile) {
  try {
    console.log(`Loading contributors data from ${inputFile}`);
    const data = await fs.readFile(inputFile, 'utf8');
    let contributors = JSON.parse(data);

    for (let contributor of contributors) {
      // Augment the contributor with additional context.
      contributor = augmentContributorData(contributor);
      console.log(`\nAssessing contributor: ${contributor.contributor}`);

      // Select up to 5 few-shot examples from previously assessed contributors.
      let fewShotExamples = [];
      if (previousExamples.length > 0) {
        fewShotExamples = selectFewShotExamples(previousExamples, 5);
      }

      // Get an ensemble assessment.
      const assessment = await ensembleAssessContributor(contributor, 3, fewShotExamples);
      contributor.finalAssessment = assessment;
      console.log(`-> Final Rating: ${assessment.rating.toFixed(2)}, Assessment: ${assessment.assessment}`);

      // Store a simplified example for future few-shot context.
      previousExamples.push({
        contributor: contributor.contributor,
        overallScore: contributor.score,
        finalRating: assessment.rating,
        assessmentSummary: assessment.assessment.substring(0, 200) // shorten if needed
      });
    }

    // Optionally, sort contributors by final rating (highest first).
    contributors.sort((a, b) => (b.finalAssessment.rating || 0) - (a.finalAssessment.rating || 0));

    const outputFile = "data/contributors_assessed.json";
    await fs.writeFile(outputFile, JSON.stringify(contributors, null, 2));
    console.log(`\nFinal assessments saved to ${outputFile}`);
  } catch (error) {
    console.error("Error processing contributor assessments:", error);
    process.exit(1);
  }
}

// Run the script.
// Usage: node enhance_assessment.js data/contributors.json
const inputFilePath = process.argv[2] || "data/contributors.json";
assessAllContributors(inputFilePath);
