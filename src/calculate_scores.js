import fs from 'fs/promises';

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
 * Calculate points for a single PR
 * @param {Object} pr - Pull request data object
 * @param {Object} stats - Statistics object
 * @returns {number} Points earned for this PR
 */
function calculatePrPoints(pr, stats) {
    let points = 0;
    
    if (pr.merged) {
        // Base points for merged PR
        points += 7;
        
        // Points for reviews
        const reviews = pr.reviews || [];
        const reviewCount = reviews.length;
        points += reviewCount * 3;  // Points for having reviews
        
        // Extra points for approved reviews
        const approvedReviews = reviews.filter(r => r.state === 'APPROVED').length;
        points += approvedReviews * 2;
    }
    
    // Points for description/effort (based on body length)
    if (pr.body) {
        points += Math.min(pr.body.length / 500, 3);  // Cap at 3 points
    }
    
    // Points for review comments
    if (pr.comments?.length) {
        points += pr.comments.length * 0.5;
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
        // Base points for engaged issues
        points += 5;
        
        // Points for comments on engaged issues
        const commentCount = issue.comments?.length || 0;
        points += commentCount * 0.5;
    }
    
    return points;
}

/**
 * Calculate points for a single commit
 * @param {Object} commit - Commit data object
 * @returns {number} Points earned for this commit
 */
function calculateCommitPoints(commit) {
    // Base point for commit
    return 1;
}

/**
 * Calculate score based on activity stats
 * @param {Object} contributor - Contributor data object
 * @returns {number} Total score for the contributor
 */
function calculateScore(contributor) {
    let score = 0;
    
    // Calculate PR points (including reviews)
    for (const pr of contributor.activity.code.pull_requests) {
        score += calculatePrPoints(pr, {});
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
        score += reviewsGiven * 5;  // Significant points for reviewing
    }
    
    // Base points for volume of activity
    score += contributor.activity.code.total_commits * 1;
    score += contributor.activity.code.total_prs * 2;
    score += contributor.activity.issues.total_opened * 1;
    score += contributor.activity.engagement.total_comments * 0.5;
    
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
    // Ensure we have the required arguments
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
    calculateCommitPoints
};