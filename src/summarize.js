import fs from 'fs/promises';
import { OpenAI } from 'openai';
import path from 'path';

import { config } from 'dotenv';
config();

/**
 * Get high-level contribution statistics for time period
 * @param {Object} data - Contributor data
 * @param {number} days - Number of days to look back
 * @returns {Object} Statistics object
 */
function getContributionStats(data, days = 90) {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const stats = {};
    const workAreas = {
        code_areas: new Set(),
        issue_areas: new Set()
    };
    
    // Process PRs
    for (const pr of data.activity.code.pull_requests) {
        try {
            const entryDate = new Date(pr.created_at);
            if (entryDate > cutoffDate) {
                stats.prs = (stats.prs || 0) + 1;
                if (pr.merged) {
                    stats.merged_prs = (stats.merged_prs || 0) + 1;
                }
                // Track affected areas from PR files
                for (const file of pr.files || []) {
                    const path = file.path;
                    if (path.includes('/')) {
                        const area = path.split('/')[0];
                        workAreas.code_areas.add(area);
                    }
                }
                // Count reviews received
                stats.reviews_received = (stats.reviews_received || 0) + 
                    (pr.reviews?.length || 0);
            }
        } catch (error) {
            console.error(`Error processing PR: ${error}`);
            continue;
        }
    }
    
    // Process Issues
    for (const issue of data.activity.issues.opened) {
        try {
            const entryDate = new Date(issue.created_at);
            if (entryDate > cutoffDate) {
                stats.issues = (stats.issues || 0) + 1;
                // Track issue labels as areas of work
                for (const label of issue.labels || []) {
                    if (label.name) {
                        workAreas.issue_areas.add(label.name);
                    }
                }
            }
        } catch (error) {
            console.error(`Error processing issue: ${error}`);
            continue;
        }
    }

    // Process Commits
    if (data.activity.code.commits) {
        for (const commit of data.activity.code.commits) {
            try {
                // Try both date field names
                const dateStr = commit.created_at || commit.committedDate;
                if (!dateStr) continue;
                
                const entryDate = new Date(dateStr);
                if (entryDate > cutoffDate) {
                    stats.commits = (stats.commits || 0) + 1;
                    stats.additions = (stats.additions || 0) + (commit.additions || 0);
                    stats.deletions = (stats.deletions || 0) + (commit.deletions || 0);
                }
            } catch (error) {
                console.error(`Error processing commit: ${error}`);
                continue;
            }
        }
    }

    return {
        stats,
        areas: {
            code_areas: [...workAreas.code_areas],
            issue_areas: [...workAreas.issue_areas]
        }
    };
}

/**
 * Get most relevant recent activity
 * @param {Object} data - Contributor data
 * @param {number} days - Number of days to look back
 * @returns {Array<string>} Array of activity descriptions
 */
function getRecentActivity(data, days = 90) {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const activity = [];
    
    // Get significant PRs
    for (const pr of data.activity.code.pull_requests) {
        try {
            const entryDate = new Date(pr.created_at);
            if (entryDate > cutoffDate) {
                let importance = 0;
                if (pr.merged) importance += 3;
                importance += (pr.reviews?.length || 0);
                importance += (pr.comments?.length || 0);
                
                // Include file change size in importance
                const files = pr.files || [];
                const changes = files.reduce((sum, f) => 
                    sum + (f.additions || 0) + (f.deletions || 0), 0);
                if (changes > 500) importance += 2;
                
                activity.push([entryDate, importance, `PR: ${pr.title}`]);
            }
        } catch (error) {
            console.error(`Error processing PR activity: ${error}`);
            continue;
        }
    }
    
    // Get issues with engagement
    for (const issue of data.activity.issues.opened) {
        try {
            const entryDate = new Date(issue.created_at);
            if (entryDate > cutoffDate) {
                const comments = issue.comments?.length || 0;
                let importance = 1 + comments;
                
                if (issue.labels?.length) {
                    importance += 1;
                }
                
                activity.push([entryDate, importance, `Issue: ${issue.title}`]);
            }
        } catch (error) {
            console.error(`Error processing issue activity: ${error}`);
            continue;
        }
    }
    
    // Get significant commits
    if (data.activity.code.commits) {
        for (const commit of data.activity.code.commits) {
            try {
                const dateStr = commit.created_at || commit.committedDate;
                if (!dateStr) continue;
                
                const entryDate = new Date(dateStr);
                if (entryDate > cutoffDate) {
                    let importance = 0;
                    const msg = commit.message?.split('\n')[0] || '';
                    
                    // Prioritize certain types of commits
                    const lowerMsg = msg.toLowerCase();
                    if (['feat:', 'fix:', 'breaking:', 'major:']
                        .some(key => lowerMsg.includes(key))) {
                        importance += 2;
                    }
                    
                    // Large changes are important
                    const changes = (commit.additions || 0) + (commit.deletions || 0);
                    if (changes > 200) importance += 1;
                    
                    activity.push([entryDate, importance, `Commit: ${msg.slice(0, 100)}`]);
                }
            } catch (error) {
                console.error(`Error processing commit activity: ${error}`);
                continue;
            }
        }
    }
    
    // Sort by importance first, then date
    activity.sort((a, b) => b[1] - a[1] || b[0] - a[0]);
    
    // Take top 15 most important activities
    return activity.slice(0, 15).map(item => item[2]);
}

/**
 * Get enhanced prompt for summary generation
 * @param {Object} data - Contributor data
 * @param {Array<string>} activity - Recent activity
 * @param {Object} stats - Contribution stats
 * @returns {string} Formatted prompt
 */
function getSummaryPrompt(data, activity, stats) {
    let areasStr = '';
    if (stats.areas.code_areas?.length) {
        areasStr += `\nCode areas: ${stats.areas.code_areas.join(', ')}`;
    }
    if (stats.areas.issue_areas?.length) {
        areasStr += `\nIssue areas: ${stats.areas.issue_areas.join(', ')}`;
    }
    
    return `Based on this GitHub activity from the last 90 days, write a 2-3 sentence summary of what ${data.contributor} worked on:

Recent Activity (most significant first):
${activity.join('\n')}

Activity Stats:
- PRs: ${stats.stats.prs || 0} (${stats.stats.merged_prs || 0} merged)
- Issues: ${stats.stats.issues || 0}
- Commits: ${stats.stats.commits || 0}
- Code Changes: +${stats.stats.additions || 0}/-${stats.stats.deletions || 0}${areasStr}

Keep it brief and focus on main areas of work. Write in present tense. Start with "${data.contributor} is"`;
}

/**
 * Generate summary using OpenAI
 * @param {Object} data - Contributor data
 * @param {string} apiKey - OpenAI API key
 * @returns {Promise<string>} Generated summary
 */
async function generateSummary(data, apiKey) {
    try {
        if (!apiKey) {
            throw new Error('OpenAI API key is required');
        }

        const activity = getRecentActivity(data, 90);
        const stats = getContributionStats(data, 90);
        
        if (!activity.length) {
            return `${data.contributor} has no significant activity in the last 90 days.`;
        }
        
        const client = new OpenAI({ apiKey });
        
        try {
            const response = await client.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: "You are a technical writer analyzing GitHub contributions."
                    },
                    {
                        role: "user",
                        content: getSummaryPrompt(data, activity, stats)
                    }
                ],
                temperature: 0.5,
                max_tokens: 4096
            });
            return response.choices[0].message.content.trim();
        } catch (apiError) {
            console.error('OpenAI API Error:', apiError);
            throw new Error(`Failed to generate summary: ${apiError.message}`);
        }
    } catch (error) {
        console.error(`Error generating summary:`, error);
        return `Unable to generate summary for ${data.contributor} due to an error: ${error.message}`;
    }
}

/**
 * Main function to process contributors and generate summaries 
 */
async function main({ inputFile, outputFile, force }) {
    console.log('\n[summarize.js] Starting...');
    console.log(`[summarize.js] Input file: ${inputFile}`);
    console.log(`[summarize.js] Output file: ${outputFile}`);

    try {
        // Load and process contributors
        console.log('[summarize.js] Reading input file...');
        let contributors;
        try {
            const fileContent = await fs.readFile(inputFile, 'utf8');
            contributors = JSON.parse(fileContent);
            console.log(`[summarize.js] Successfully loaded ${contributors.length} contributors`);
        } catch (error) {
            console.error('[summarize.js] Error reading input:', error);
            throw new Error(`Failed to read input file: ${error.message}`);
        }

        // Ensure output directory exists
        const outputDir = path.dirname(outputFile);
        console.log(`[summarize.js] Creating output directory: ${outputDir}`);
        await fs.mkdir(outputDir, { recursive: true });

        // Process each contributor
        console.log('[summarize.js] Processing contributors...');
        for (const contributor of contributors) {
            try {
                console.log(`[summarize.js] Processing ${contributor.contributor}...`);
                const summary = await generateSummary(contributor, process.env.OPENAI_API_KEY);
                contributor.summary = summary;
                console.log(`[summarize.js] Generated summary for ${contributor.contributor}`);
            } catch (error) {
                console.error(`[summarize.js] Error processing ${contributor.contributor}:`, error);
                contributor.summary = `Error generating summary: ${error.message}`;
            }
        }

        // Write output file
        console.log(`[summarize.js] Writing to ${outputFile}`);
        try {
            const outputData = JSON.stringify(contributors, null, 2);
            await fs.writeFile(outputFile, outputData);
            
            // Verify the write was successful
            const fileStats = await fs.stat(outputFile);
            console.log(`[summarize.js] Successfully wrote ${fileStats.size} bytes to ${outputFile}`);

            // Double-check the file is readable
            const verification = await fs.readFile(outputFile, 'utf8');
            const parsed = JSON.parse(verification);
            console.log(`[summarize.js] Verified file contains ${parsed.length} contributors`);

        } catch (error) {
            console.error('[summarize.js] Error writing output:', error);
            throw new Error(`Failed to write output file: ${error.message}`);
        }

    } catch (error) {
        console.error('[summarize.js] Error:', error.message);
        throw error;
    }
}

// Command line handling
if (process.argv[1].endsWith('summarize.js')) {
    import('yargs')
        .then(({ default: yargs }) => {
            const argv = yargs(process.argv.slice(2))
                .option('f', {
                    alias: 'force',
                    type: 'boolean',
                    default: false,
                    describe: 'Force overwrite output file'
                })
                .usage('Usage: $0 <input_file> <output_file> [options]')
                .demandCommand(2)
                .argv;

            const [inputFile, outputFile] = argv._;
            console.log(`[summarize.js] Running with:
                Input: ${inputFile}
                Output: ${outputFile}
                Force: ${argv.force}`);
                
            main({
                inputFile,
                outputFile,
                force: argv.force
            }).catch(error => {
                console.error('[summarize.js] Fatal error:', error);
                process.exit(1);
            });
        });
}

export { generateSummary, getContributionStats, getRecentActivity, main };