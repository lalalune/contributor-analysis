import fs from 'fs/promises';
import { config } from 'dotenv';

config();

// Base Points Configuration
const PR_POINTS_BASE = process.env.PR_POINTS_BASE || 7;
const PR_POINTS_REVIEW = process.env.PR_POINTS_REVIEW || 3;
const PR_POINTS_APPROVED = process.env.PR_POINTS_APPROVED || 2;
const PR_POINTS_DESCRIPTION = process.env.PR_POINTS_DESCRIPTION || 3;
const PR_POINTS_COMMENTS = process.env.PR_POINTS_COMMENTS || 0.5;

const ISSUE_POINTS_BASE = process.env.ISSUE_POINTS_BASE || 5;
const ISSUE_POINTS_COMMENTS = process.env.ISSUE_POINTS_COMMENTS || 0.5;

const TOTAL_COMMITS_BASE = process.env.TOTAL_COMMITS_BASE || 1;
const TOTAL_PRS_BASE = process.env.TOTAL_PRS_BASE || 2;
const TOTAL_ISSUES = process.env.TOTAL_ISSUES || 1;
const TOTAL_COMMENTS = process.env.TOTAL_COMMENTS || 0.5;
const REVIEW_POINTS = process.env.REVIEW_POINTS || 5;

// PR Size Multipliers
const PR_SIZE_MULTIPLIER_SMALL = 0.8;    // < 50 lines
const PR_SIZE_MULTIPLIER_MEDIUM = 1.2;   // 50-300 lines
const PR_SIZE_MULTIPLIER_LARGE = 0.9;    // > 300 lines

// PR Quality Bonuses
const PR_BONUS_SQUASHED = 2;           // Single-commit squashed PRs
const PR_BONUS_CODE_DELETION = 1.5;    // PRs that reduce code size
const PR_BONUS_DOCUMENTATION = 1.2;    // PRs with good documentation

// Issue Type Multipliers
const ISSUE_MULTIPLIER_BUG = 1.3;
const ISSUE_MULTIPLIER_FEATURE = 1.0;
const ISSUE_MULTIPLIER_DOCS = 0.8;
const ISSUE_MULTIPLIER_ENHANCEMENT = 1.1;

// Issue Complexity Multipliers
const ISSUE_COMPLEXITY_HIGH = 1.5;
const ISSUE_COMPLEXITY_MEDIUM = 1.2;
const ISSUE_COMPLEXITY_LOW = 1.0;

// Collaboration Points
const COLLAB_POINTS_MERGE = 2;     // Points for helping merge a PR
const COLLAB_POINTS_REVIEW = 1;    // Constructive review comments
const COLLAB_POINTS_COORDINATION = 1.5;  // Cross-team coordination

/**
 * Check if an issue has engagement (comments or reactions)
 * @param {Object} issue - Issue data object
 * @returns {boolean} Whether the issue has engagement
 */
function hasEngagement(issue) {
    const hasComments = (issue.comments?.length || 0) > 0;
    const hasReactions = issue.comments?.some(comment => 
        (comment.reactions?.length || 0) > 0
    ) || false;
    
    return hasComments || hasReactions;
}

/**
 * Calculate PR size multiplier based on total changes
 */
function calculatePRSizeMultiplier(pr) {
    const totalChanges = pr.files.reduce((sum, file) => 
        sum + (file.additions || 0) + (file.deletions || 0), 0);
    
    if (totalChanges < 50) return PR_SIZE_MULTIPLIER_SMALL;
    if (totalChanges > 300) return PR_SIZE_MULTIPLIER_LARGE;
    return PR_SIZE_MULTIPLIER_MEDIUM;
}

/**
 * Evaluate PR quality and calculate bonus multiplier
 */
function evaluatePRQuality(pr) {
    let multiplier = 1.0;
    
    // Check for squashed PRs (single commit with substantial changes)
    const commitCount = pr.commits?.length || 1;
    if (commitCount === 1) {
        const totalChanges = pr.files.reduce((sum, file) => 
            sum + (file.additions || 0) + (file.deletions || 0), 0);
        if (totalChanges > 200) {
            multiplier *= PR_BONUS_SQUASHED;
        }
    }
    
    // Reward code deletion
    const totalDeletions = pr.files.reduce((sum, file) => 
        sum + (file.deletions || 0), 0);
    const totalAdditions = pr.files.reduce((sum, file) => 
        sum + (file.additions || 0), 0);
    if (totalDeletions > totalAdditions + 50) {
        multiplier *= PR_BONUS_CODE_DELETION;
    }
    
    // Check documentation quality
    if (pr.body && pr.body.length > 500) {
        multiplier *= PR_BONUS_DOCUMENTATION;
    }
    
    return multiplier;
}

/**
 * Calculate issue multipliers based on type and complexity
 */
function calculateIssueMultiplier(issue) {
    let typeMultiplier = ISSUE_MULTIPLIER_FEATURE;
    let complexityMultiplier = ISSUE_COMPLEXITY_MEDIUM;
    
    // Determine type from labels
    const labels = issue.labels?.map(l => l.name.toLowerCase()) || [];
    if (labels.includes('bug')) {
        typeMultiplier = ISSUE_MULTIPLIER_BUG;
    } else if (labels.includes('documentation')) {
        typeMultiplier = ISSUE_MULTIPLIER_DOCS;
    } else if (labels.includes('enhancement')) {
        typeMultiplier = ISSUE_MULTIPLIER_ENHANCEMENT;
    }
    
    // Determine complexity
    if (labels.includes('complex') || labels.includes('high-priority')) {
        complexityMultiplier = ISSUE_COMPLEXITY_HIGH;
    } else if (labels.includes('easy') || labels.includes('good-first-issue')) {
        complexityMultiplier = ISSUE_COMPLEXITY_LOW;
    }
    
    return typeMultiplier * complexityMultiplier;
}

/**
 * Calculate collaboration points for a PR
 */
function calculateCollaborationPoints(pr, contributorLogin) {
    let points = 0;
    
    // Points for merging others' PRs
    if (pr.merged_by === contributorLogin && pr.author?.login !== contributorLogin) {
        points += COLLAB_POINTS_MERGE;
    }
    
    // Points for review comments
    const reviewComments = pr.reviews?.filter(r => 
        r.author === contributorLogin && r.body?.length > 20
    ).length || 0;
    points += reviewComments * COLLAB_POINTS_REVIEW;
    
    // Points for coordination
    const coordComments = pr.comments?.filter(c => 
        c.author === contributorLogin && 
        (c.body?.match(/@\w+/g) || []).length > 1
    ).length || 0;
    points += coordComments * COLLAB_POINTS_COORDINATION;
    
    return points;
}

/**
 * Calculate points for a single PR
 * @param {Object} pr - Pull request data object
 * @param {Object} stats - Statistics object
 * @returns {number} Points earned for this PR
 */
function calculatePrPoints(pr, stats) {
    let points = 0;
    
    if (pr.merged && !pr.draft) {
        // Base points with size and quality adjustments
        const sizeMultiplier = calculatePRSizeMultiplier(pr);
        const qualityMultiplier = evaluatePRQuality(pr);
        points += PR_POINTS_BASE * sizeMultiplier * qualityMultiplier;
        
        // Points for reviews and approvals
        const reviews = pr.reviews || [];
        points += reviews.length * PR_POINTS_REVIEW;
        const approvedReviews = reviews.filter(r => r.state === 'APPROVED').length;
        points += approvedReviews * PR_POINTS_APPROVED;
        
        // Points for description
        if (pr.body) {
            points += Math.min(pr.body.length / 500, PR_POINTS_DESCRIPTION);
        }
        
        // Points for meaningful comments
        if (pr.comments?.length) {
            const meaningfulComments = pr.comments.filter(c => c.body?.length > 50).length;
            points += meaningfulComments * PR_POINTS_COMMENTS;
        }
    }
    
    return points;
}

/**
 * Calculate points for a single issue
 * @param {Object} issue - Issue data object
 * @returns {number} Points earned for this issue
 */
function calculateIssuePoints(issue) {
    let points = 0;
    
    if (hasEngagement(issue)) {
        // Base points with type and complexity adjustments
        const multiplier = calculateIssueMultiplier(issue);
        points += ISSUE_POINTS_BASE * multiplier;
        
        // Points for meaningful discussion
        const commentCount = issue.comments?.length || 0;
        points += commentCount * ISSUE_POINTS_COMMENTS;
    }
    
    return points;
}

/**
 * Calculate points for a single commit
 * @param {Object} commit - Commit data object
 * @returns {number} Points earned for this commit
 */
function calculateCommitPoints(commit) {
    return TOTAL_COMMITS_BASE;
}

/**
 * Calculate score based on activity stats
 * @param {Object} contributor - Contributor data object
 * @returns {number} Total score for the contributor
 */
function calculateScore(contributor) {
    let score = 0;
    
    // Calculate PR points with enhanced metrics
    for (const pr of contributor.activity.code.pull_requests) {
        score += calculatePrPoints(pr, {});
        score += calculateCollaborationPoints(pr, contributor.contributor);
    }
    
    // Calculate issue points
    for (const issue of contributor.activity.issues.opened) {
        score += calculateIssuePoints(issue);
    }
    
    // Calculate commit points
    for (const commit of contributor.activity.code.commits) {
        score += calculateCommitPoints(commit);
    }
    
    // Points for being reviewer on others' PRs
    for (const pr of contributor.activity.code.pull_requests) {
        const reviewsGiven = pr.reviews?.filter(r => 
            r.author === contributor.contributor
        ).length || 0;
        score += reviewsGiven * REVIEW_POINTS;
    }
    
    // Base points for activity volume
    score += contributor.activity.code.total_commits * TOTAL_COMMITS_BASE;
    score += contributor.activity.code.total_prs * TOTAL_PRS_BASE;
    score += contributor.activity.issues.total_opened * TOTAL_ISSUES;
    score += contributor.activity.engagement.total_comments * TOTAL_COMMENTS;
    
    return Math.floor(score);
}

/**
 * Add scores to contributor data
 * @param {Array} contributors - Array of contributor data objects
 * @returns {Array} Contributors with added scores
 */
function addScores(contributors) {
    for (const contributor of contributors) {
        contributor.score = calculateScore(contributor);
    }
    
    // Sort by score
    contributors.sort((a, b) => b.score - a.score);
    return contributors;
}

/**
 * Main processing function
 * @param {string} inputFile - Path to input JSON file
 * @param {string} outputFile - Path to output JSON file
 */
async function main(inputFile, outputFile) {
    console.log(`\nReading from ${inputFile}`);
    let contributors;
    
    try {
        const data = await fs.readFile(inputFile, 'utf8');
        contributors = JSON.parse(data);
        console.log(`Successfully loaded ${contributors.length} contributors`);
    } catch (error) {
        console.error('Error loading input file:', error);
        throw error;
    }
    
    console.log('\nCalculating scores...');
    try {
        const scoredContributors = addScores(contributors);
        console.log(`Scores calculated for ${scoredContributors.length} contributors`);
        
        console.log('\nWriting output...');
        await fs.writeFile(outputFile, JSON.stringify(contributors, null, 2));
        console.log(`Successfully wrote to ${outputFile}`);
        
        // Print scoring summary for top contributors
        console.log('\nTop contributors by score:');
        for (const contrib of contributors.slice(0, 5)) {
            const mergedPrs = contrib.activity.code.pull_requests.filter(pr => 
                pr.merged
            ).length;
            
            console.log(`\n${contrib.contributor}:`);
            console.log(`  Total Score: ${contrib.score}`);
            console.log(`  PRs: ${contrib.activity.code.total_prs} (${mergedPrs} merged)`);
            console.log(`  Issues: ${contrib.activity.issues.total_opened}`);
            console.log(`  Commits: ${contrib.activity.code.total_commits}`);
            console.log(`  Comments: ${contrib.activity.engagement.total_comments}`);
        }
    } catch (error) {
        console.error('Error processing data:', error);
        throw error;
    }
}

// Command line handling
if (process.argv[1].endsWith('calculate_scores.js')) {
    if (process.argv.length < 4) {
        console.error('Usage: node calculate_scores.js <input_file> <output_file>');
        process.exit(1);
    }

    const [inputFile, outputFile] = process.argv.slice(2);
    main(inputFile, outputFile).catch(err => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
}

export {
    calculateScore,
    addScores,
    hasEngagement,
    calculatePrPoints,
    calculateIssuePoints,
    calculateCommitPoints,
    // Export constants for testing and configuration
    PR_POINTS_BASE,
    PR_POINTS_REVIEW,
    PR_POINTS_APPROVED,
    PR_POINTS_DESCRIPTION,
    PR_POINTS_COMMENTS,
    ISSUE_POINTS_BASE,
    ISSUE_POINTS_COMMENTS,
    TOTAL_COMMITS_BASE,
    TOTAL_PRS_BASE,
    TOTAL_ISSUES,
    TOTAL_COMMENTS,
    REVIEW_POINTS
};