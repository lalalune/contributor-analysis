import { OpenAI } from 'openai';
import { config } from 'dotenv';
import fs from 'fs/promises';

config();

// Contributor archetypes with behavioral patterns
const ARCHETYPES = {
    architecturalLeader: {
        description: `Senior technical leader who focuses on system architecture and major design decisions.
        - Writes detailed, well-thought-out PRs with comprehensive documentation
        - Provides in-depth technical reviews
        - Often coordinates between multiple teams
        - Focuses on architectural improvements and technical debt
        - Typically produces fewer but higher-impact contributions`,
        contentStyle: `Technical, detailed, and architectural focused. Uses terms like:
        - "architectural implications"
        - "system design considerations"
        - "performance characteristics"
        - "scalability concerns"
        - "technical debt reduction"`,
        volumeProfile: {
            prs: { min: 5, max: 15 },
            commits: { min: 20, max: 50 },
            issues: { min: 3, max: 10 },
            commentsPerItem: { min: 3, max: 8 }
        }
    },

    productionWorkhorse: {
        description: `High-volume contributor who consistently delivers features and fixes.
        - Regular, steady stream of contributions
        - Good quality but not always extensively documented
        - Practical problem-solver
        - Focuses on feature delivery and bug fixes
        - High volume of meaningful contributions`,
        contentStyle: `Practical and implementation-focused. Uses terms like:
        - "implemented feature"
        - "fixed issue"
        - "added tests"
        - "performance improvement"
        - "code cleanup"`,
        volumeProfile: {
            prs: { min: 30, max: 60 },
            commits: { min: 100, max: 200 },
            issues: { min: 15, max: 30 },
            commentsPerItem: { min: 2, max: 5 }
        }
    },

    teamCoordinator: {
        description: `Cross-team coordinator who excels at bringing people together.
        - Fewer direct code contributions
        - Extensive comments and reviews
        - Often helps unblock others
        - Strong focus on documentation
        - High engagement in discussions`,
        contentStyle: `Collaborative and coordination-focused. Uses terms like:
        - "coordinated with team"
        - "consensus reached"
        - "documentation update"
        - "process improvement"
        - "team feedback incorporated"`,
        volumeProfile: {
            prs: { min: 15, max: 30 },
            commits: { min: 50, max: 100 },
            issues: { min: 20, max: 40 },
            commentsPerItem: { min: 5, max: 10 }
        }
    },

    bugHunter: {
        description: `Specialized in finding and fixing complex bugs.
        - High volume of small, focused fixes
        - Detailed reproduction steps
        - Strong debugging narratives
        - Often helps others with investigations
        - Mix of small fixes and deep investigations`,
        contentStyle: `Detail-oriented and investigation-focused. Uses terms like:
        - "root cause analysis"
        - "reproduction steps"
        - "fixed edge case"
        - "performance regression"
        - "debug findings"`,
        volumeProfile: {
            prs: { min: 40, max: 80 },
            commits: { min: 120, max: 240 },
            issues: { min: 30, max: 60 },
            commentsPerItem: { min: 2, max: 6 }
        }
    },

    maintainer: {
        description: `Focused on code health and maintenance.
        - Regular refactoring work
        - Dependency updates
        - Test improvements
        - Documentation maintenance
        - Moderate but consistent volume`,
        contentStyle: `Maintenance and quality focused. Uses terms like:
        - "refactored for clarity"
        - "updated dependencies"
        - "improved test coverage"
        - "documentation refresh"
        - "code cleanup"`,
        volumeProfile: {
            prs: { min: 20, max: 40 },
            commits: { min: 80, max: 160 },
            issues: { min: 10, max: 20 },
            commentsPerItem: { min: 2, max: 4 }
        }
    }
};

/**
 * Generate content using GPT-4 turbo
 */
async function generateContent(prompt, context = '') {
    const client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
    });

    try {
        const response = await client.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `You are generating realistic GitHub contribution content for a ${context}. 
                    Keep responses focused and relevant to the prompt. Output should be direct, without explanations.`
                },
                { role: "user", content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 4096
        });

        return response.choices[0].message.content.trim();
    } catch (error) {
        console.error('Error generating content:', error);
        return '';
    }
}

/**
 * Generate realistic PR content based on archetype
 */
async function generatePR(archetype, prType = 'feature') {
    const typePrompts = {
        feature: 'Generate a PR title and description for a new feature',
        bugfix: 'Generate a PR title and description for a bug fix',
        refactor: 'Generate a PR title and description for a code refactor',
        docs: 'Generate a PR title and description for documentation improvements'
    };

    const title = await generateContent(
        `${typePrompts[prType]}. Format: feat/fix/refactor: Brief description`,
        archetype.description
    );

    const body = await generateContent(
        `Generate a detailed PR description for: ${title}`,
        archetype.description
    );

    return { title, body };
}

/**
 * Generate realistic issue content
 */
async function generateIssue(archetype, issueType = 'feature') {
    const typePrompts = {
        feature: 'Generate an issue title and description for a feature request',
        bug: 'Generate an issue title and description for a bug report',
        improvement: 'Generate an issue title and description for an improvement proposal'
    };

    const title = await generateContent(
        `${typePrompts[issueType]}. Keep it concise but descriptive.`,
        archetype.description
    );

    const body = await generateContent(
        `Generate a detailed issue description for: ${title}`,
        archetype.description
    );

    return { title, body };
}

/**
 * Generate realistic comment content
 */
async function generateComment(archetype, context) {
    return generateContent(
        `Generate a code review comment or discussion response regarding: ${context}`,
        archetype.description
    );
}

/**
 * Generate comments for an item
 */
async function generateComments(archetype, context, profile) {
    const commentCount = Math.floor(Math.random() * (profile.max - profile.min + 1)) + profile.min;
    
    return Promise.all(Array(commentCount).fill(null).map(async () => ({
        body: await generateComment(archetype, context)
    })));
}

/**
 * Generate reviews for a PR
 */
async function generateReviews(archetype, context) {
    const reviewCount = Math.floor(Math.random() * 3) + 1;
    
    return Promise.all(Array(reviewCount).fill(null).map(async () => ({
        state: Math.random() > 0.2 ? 'APPROVED' : 'CHANGES_REQUESTED',
        body: await generateComment(archetype, context)
    })));
}

/**
 * Calculate token distribution for a team
 */
function calculateTokenDistribution(totalTokens, contributors) {
    const baseTokens = Math.floor(totalTokens * 0.2 / contributors.length);
    const remainingTokens = totalTokens - (baseTokens * contributors.length);
    
    // Calculate weighted distribution based on contribution volume
    const totalActivity = contributors.reduce((sum, c) => 
        sum + c.activity.code.total_commits + 
        (c.activity.code.total_prs * 3) + 
        (c.activity.issues.total_opened * 2), 0);
    
    const distribution = {};
    contributors.forEach(c => {
        const activity = c.activity.code.total_commits + 
            (c.activity.code.total_prs * 3) + 
            (c.activity.issues.total_opened * 2);
        
        const share = activity / totalActivity;
        distribution[c.contributor] = Math.floor(baseTokens + (remainingTokens * share));
    });
    
    return distribution;
}

/**
 * Generate a single contributor's activity
 */
async function generateContributor(archetypeKey, archetypeObj, index) {
    const profile = archetypeObj.volumeProfile;
    const prCount = Math.floor(Math.random() * (profile.prs.max - profile.prs.min + 1)) + profile.prs.min;
    const commitCount = Math.floor(Math.random() * (profile.commits.max - profile.commits.min + 1)) + profile.commits.min;
    const issueCount = Math.floor(Math.random() * (profile.issues.max - profile.issues.min + 1)) + profile.issues.min;
    
    // Generate activities
    const prs = await Promise.all(Array(prCount).fill(null).map(async (_, i) => {
        const prType = Math.random() > 0.7 ? 'bugfix' : 'feature';
        const { title, body } = await generatePR(archetypeObj, prType);
        return {
            number: i,
            title,
            body,
            state: "merged",
            merged: true,
            created_at: new Date(Date.now() - (i * 24 * 60 * 60 * 1000)),
            comments: await generateComments(archetypeObj, title, profile.commentsPerItem),
            reviews: await generateReviews(archetypeObj, title)
        };
    }));
    
    const issues = await Promise.all(Array(issueCount).fill(null).map(async (_, i) => {
        const issueType = Math.random() > 0.6 ? 'bug' : 'feature';
        const { title, body } = await generateIssue(archetypeObj, issueType);
        return {
            number: i,
            title,
            body,
            state: "closed",
            created_at: new Date(Date.now() - (i * 24 * 60 * 60 * 1000)),
            comments: await generateComments(archetypeObj, title, profile.commentsPerItem)
        };
    }));
    
    return {
        contributor: `${archetypeKey.toLowerCase()}_${index}`,
        archetype: archetypeKey,
        activity: {
            code: {
                total_commits: commitCount,
                total_prs: prCount,
                commits: Array(commitCount).fill(null).map((_, i) => ({
                    sha: `commit_${i}`,
                    message: `feat: Generated commit message ${i}`,
                    created_at: new Date(Date.now() - (i * 24 * 60 * 60 * 1000))
                })),
                pull_requests: prs
            },
            issues: {
                total_opened: issueCount,
                opened: issues
            },
            engagement: {
                total_comments: prs.reduce((sum, pr) => sum + pr.comments.length, 0) +
                              issues.reduce((sum, issue) => sum + issue.comments.length, 0),
                comments: [...prs.flatMap(pr => pr.comments), ...issues.flatMap(issue => issue.comments)]
            }
        }
    };
}

/**
 * Generate a complete contribution scenario
 */
async function generateScenario(teamSize = 5, totalTokens = 1000000) {
    const archetypeKeys = Object.keys(ARCHETYPES);
    const selectedArchetypes = [];
    
    // Ensure we have at least one architectural leader and one production workhorse
    selectedArchetypes.push('architecturalLeader', 'productionWorkhorse');
    
    // Randomly select remaining archetypes
    while (selectedArchetypes.length < teamSize) {
        const remaining = archetypeKeys.filter(k => !selectedArchetypes.includes(k));
        const randomIndex = Math.floor(Math.random() * remaining.length);
        selectedArchetypes.push(remaining[randomIndex]);
    }
    
    const contributors = [];
    
    // Generate content for each contributor
    for (let i = 0; i < teamSize; i++) {
        const archetypeKey = selectedArchetypes[i];
        const archetypeObj = ARCHETYPES[archetypeKey];
        const contributor = await generateContributor(archetypeKey, archetypeObj, i);
        contributors.push(contributor);
        
        // Log progress
        console.log(`Generated contributor ${i + 1}/${teamSize}: ${archetypeKey}`);
    }
    
    // Calculate token distribution
    const distribution = calculateTokenDistribution(totalTokens, contributors);
    
    return {
        contributors,
        tokenDistribution: distribution,
        teamSize,
        totalTokens,
        selectedArchetypes
    };
}

/**
 * Run the scenario generation and save results
 */
async function runScenarioGeneration() {
    const outputFile = process.argv[2] || 'generated_scenario.json';
    const teamSize = parseInt(process.argv[3]) || 5;
    const totalTokens = parseInt(process.argv[4]) || 1000000;
    
    console.log(`\nGenerating scenario:`);
    console.log(`- Team Size: ${teamSize}`);
    console.log(`- Total Tokens: ${totalTokens}`);
    console.log(`- Output File: ${outputFile}`);
    
    try {
        const startTime = Date.now();
        const scenario = await generateScenario(teamSize, totalTokens);
        const endTime = Date.now();
        
        // Save the complete scenario
        await fs.writeFile(outputFile, JSON.stringify(scenario, null, 2));
        
        // Generate and save summary
        const summary = {
            totalContributors: scenario.contributors.length,
            totalTokens: scenario.totalTokens,
            tokenDistribution: scenario.tokenDistribution,
            archetypes: scenario.selectedArchetypes,
            contributorStats: scenario.contributors.map(c => ({
                name: c.contributor,
                archetype: c.archetype,
                prs: c.activity.code.total_prs,
                commits: c.activity.code.total_commits,
                issues: c.activity.issues.total_opened,
                comments: c.activity.engagement.total_comments,
                tokens: scenario.tokenDistribution[c.contributor]
            }))
        };
        
        await fs.writeFile(
            outputFile.replace('.json', '_summary.json'),
            JSON.stringify(summary, null, 2)
        );
        
        // Log results
        console.log('\nScenario generated successfully!');
        console.log(`Time taken: ${(endTime - startTime) / 1000} seconds`);
        
        // Print summary
        console.log('\nContributor Summary:');
        summary.contributorStats.forEach(stat => {
            console.log(`\n${stat.name} (${stat.archetype}):`);
            console.log(`  PRs: ${stat.prs}`);
            console.log(`  Commits: ${stat.commits}`);
            console.log(`  Issues: ${stat.issues}`);
            console.log(`  Comments: ${stat.comments}`);
            console.log(`  Token Allocation: ${stat.tokens.toLocaleString()} (${
                ((stat.tokens / totalTokens) * 100).toFixed(1)
            }%)`);
        });
        
        console.log(`\nScenario saved to: ${outputFile}`);
        console.log(`Summary saved to: ${outputFile.replace('.json', '_summary.json')}`);
        
        return { scenario, summary };
    } catch (error) {
        console.error('Error generating scenario:', error);
        process.exit(1);
    }
}

/**
 * Validate the generated content against token limits
 * @param {Object} content - The generated content
 * @returns {Object} Validation results
 */
function validateContent(content) {
    // Rough token estimation (4 chars per token on average)
    const estimateTokens = (text) => Math.ceil((text || '').length / 4);
    
    const results = {
        totalTokens: 0,
        sections: {
            prs: 0,
            issues: 0,
            commits: 0,
            comments: 0
        },
        exceedsLimit: false
    };
    
    // Count PR tokens
    content.contributors.forEach(contributor => {
        contributor.activity.code.pull_requests.forEach(pr => {
            const prTokens = estimateTokens(pr.title) + estimateTokens(pr.body);
            results.sections.prs += prTokens;
            results.totalTokens += prTokens;
            
            // Count PR comments and reviews
            pr.comments?.forEach(comment => {
                const commentTokens = estimateTokens(comment.body);
                results.sections.comments += commentTokens;
                results.totalTokens += commentTokens;
            });
            
            pr.reviews?.forEach(review => {
                const reviewTokens = estimateTokens(review.body);
                results.sections.comments += reviewTokens;
                results.totalTokens += reviewTokens;
            });
        });
        
        // Count issue tokens
        contributor.activity.issues.opened.forEach(issue => {
            const issueTokens = estimateTokens(issue.title) + estimateTokens(issue.body);
            results.sections.issues += issueTokens;
            results.totalTokens += issueTokens;
            
            issue.comments?.forEach(comment => {
                const commentTokens = estimateTokens(comment.body);
                results.sections.comments += commentTokens;
                results.totalTokens += commentTokens;
            });
        });
        
        // Count commit tokens
        contributor.activity.code.commits.forEach(commit => {
            const commitTokens = estimateTokens(commit.message);
            results.sections.commits += commitTokens;
            results.totalTokens += commitTokens;
        });
    });
    
    results.exceedsLimit = results.totalTokens > 120000;
    
    return results;
}

// Main execution if run directly
    runScenarioGeneration().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });