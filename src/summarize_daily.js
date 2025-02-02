import fs from 'fs/promises';
import path from 'path';

/**
 * Get activity metrics with file-level analysis
 * @param {Array} data - Contributor data array
 * @returns {Object} Detailed activity metrics
 */
function analyzeActivityMetrics(data) {
    const metrics = {
        basic_metrics: {
            contributors: 0,
            commits: 0,
            merged_prs: 0,
            new_issues: 0
        },
        pr_types: {},
        file_changes: {},
        issue_labels: {}
    };

    // Helper function to count PR types
    function countPrType(title) {
        const lowerTitle = title.toLowerCase();
        if (lowerTitle.includes('feat:')) return 'features';
        if (lowerTitle.includes('fix:')) return 'fixes';
        if (lowerTitle.includes('chore:')) return 'chores';
        if (lowerTitle.includes('refactor:')) return 'refactors';
        return 'other';
    }

    try {
        for (const contributor of data) {
            // Process PRs
            for (const pr of contributor.activity.code.pull_requests) {
                if (pr.merged) {
                    metrics.basic_metrics.merged_prs++;
                    
                    // Categorize PR types
                    const prType = countPrType(pr.title);
                    metrics.pr_types[prType] = (metrics.pr_types[prType] || 0) + 1;
                    
                    // Process file changes
                    for (const file of pr.files || []) {
                        const category = file.path.includes('/') ? 
                            file.path.split('/')[0] : 'root';
                        
                        if (!metrics.file_changes[category]) {
                            metrics.file_changes[category] = { adds: 0, dels: 0, changes: 0 };
                        }
                        
                        metrics.file_changes[category].adds += file.additions || 0;
                        metrics.file_changes[category].dels += file.deletions || 0;
                        metrics.file_changes[category].changes++;
                    }
                }
            }
            
            // Process Issues
            for (const issue of contributor.activity.issues.opened) {
                metrics.basic_metrics.new_issues++;
                for (const label of issue.labels || []) {
                    const labelName = label.name || 'unlabeled';
                    metrics.issue_labels[labelName] = 
                        (metrics.issue_labels[labelName] || 0) + 1;
                }
            }
            
            // Process Commits
            metrics.basic_metrics.commits += 
                contributor.activity.code.commits.length;
        }
        
        metrics.basic_metrics.contributors = data.length;
        return metrics;
    } catch (error) {
        console.error('Error analyzing activity metrics:', error);
        throw error;
    }
}

/**
 * Generate overview of daily activities
 * @param {Object} metrics - Activity metrics
 * @param {Array} changes - Change data
 * @param {Array} data - Full contributor data
 * @returns {string} Generated overview text
 */
function generateOverview(metrics, changes, data) {
    try {
        // Get key features and changes
        const features = changes
            .filter(c => c.merged && c.title.toLowerCase().startsWith('feat:'))
            .map(c => {
                const parts = c.title.split(':');
                return parts.length > 1 ? parts[1].trim() : '';
            })
            .filter(Boolean);

        // Get key areas and what's being built
        const keyDevelopments = [];
        
        if (metrics.file_changes.packages) {
            const pkgChange = changes.find(c => {
                if (!c.merged) return false;
                const title = c.title.toLowerCase();
                return title.includes('plugin') || title.includes('client');
            });
            
            if (pkgChange) {
                const parts = pkgChange.title.split(':');
                if (parts.length > 1) {
                    keyDevelopments.push(`package improvements (${parts[1].trim()})`);
                }
            }
        }

        if (features.length > 0) {
            keyDevelopments.push(`new features (${features[0]})`);
        }

        if (metrics.pr_types.fixes) {
            keyDevelopments.push(`${metrics.pr_types.fixes} bug fixes`);
        }

        // Find major work summary
        let majorWork = 'various improvements';
        const significantContributor = data.find(c => c.score > 50 && c.summary);
        if (significantContributor) {
            const summaryParts = significantContributor.summary.split('.');
            if (summaryParts[0]) {
                majorWork = summaryParts[0].toLowerCase();
            }
        }

        // Build overview text
        const overviewParts = [];

        if (keyDevelopments.length > 0) {
            overviewParts.push(`Development focused on ${keyDevelopments.join(', ')}`);
        }

        const contributorInfo = 
            `with ${metrics.basic_metrics.contributors} contributors merging ${metrics.basic_metrics.merged_prs} PRs`;
        overviewParts.push(contributorInfo);

        if (majorWork) {
            overviewParts.push(`Major work included ${majorWork}`);
        }

        return overviewParts.join('. ') + '.';
    } catch (error) {
        console.error('Error generating overview:', error);
        throw error;
    }
}

/**
 * Get detailed contributor information
 * @param {Array} data - Contributor data array
 * @returns {Array} Top contributor details
 */
function getContributorDetails(data) {
    try {
        return data
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .map(c => {
                const mainPr = c.activity.code.pull_requests
                    .find(pr => pr.merged)?.title;
                
                const summary = c.summary?.split('.')[0] || '';
                
                const areas = new Set(
                    c.activity.code.pull_requests
                        .filter(pr => pr.merged && pr.files)
                        .flatMap(pr => pr.files.map(f => f.path.split('/')[0]))
                );

                return {
                    name: c.contributor,
                    main_contribution: mainPr,
                    summary: summary,
                    areas: [...areas].slice(0, 3)
                };
            });
    } catch (error) {
        console.error('Error getting contributor details:', error);
        throw error;
    }
}

/**
 * Generate structured JSON summary of activity
 * @param {Object} metrics - Activity metrics
 * @param {Array} data - Contributor data array
 * @returns {Object} Structured summary
 */
function generateJsonSummary(metrics, data) {
    try {
        const changes = data.flatMap(c => 
            c.activity.code.pull_requests.filter(pr => pr.merged)
        );
        
        // Extract version info
        const versionPR = changes.find(c => 
            c.title.toLowerCase().includes('version') || 
            c.title.toLowerCase().includes('bump')
        );
        const version = versionPR ? 
            versionPR.title.split(':')[1]?.trim() : '';
        
        // Collect all issues
        const allIssues = data.flatMap(c => c.activity.issues.opened);
        
        const bugs = allIssues.filter(issue => 
            issue.labels?.some(label => label.name === 'bug')
        );
        
        const enhancements = allIssues.filter(issue => 
            issue.labels?.some(label => label.name === 'enhancement')
        );
        
        // Generate issue summary
        let issueSummary = '';
        if (bugs.length || enhancements.length) {
            const summaries = [];
            if (bugs.length) {
                const bugTitles = bugs.slice(0, 2).map(i => `'${i.title}'`);
                summaries.push(`working on ${bugs.length} bugs including ${bugTitles.join(', ')}`);
            }
            if (enhancements.length) {
                const enhancementTitles = enhancements.slice(0, 2).map(i => `'${i.title}'`);
                summaries.push(`implementing ${enhancements.length} feature requests including ${enhancementTitles.join(', ')}`);
            }
            issueSummary = summaries.join(' and ');
        }
        
        // Process PR titles for changes
        const features = [], fixes = [], chores = [];
        for (const c of changes) {
            if (!c.title.includes(':')) continue;
            const [type, content] = c.title.split(':');
            const cleanContent = content.trim();
            switch (type.toLowerCase()) {
                case 'feat':
                    features.push(cleanContent);
                    break;
                case 'fix':
                    fixes.push(cleanContent);
                    break;
                case 'chore':
                    chores.push(cleanContent);
                    break;
            }
        }

        return {
            title: `elizaos Eliza (${new Date().toISOString().split('T')[0]})`,
            version,
            overview: generateOverview(metrics, changes, data),
            metrics: {
                contributors: metrics.basic_metrics.contributors,
                merged_prs: metrics.basic_metrics.merged_prs,
                new_issues: metrics.basic_metrics.new_issues,
                lines_changed: Object.values(metrics.file_changes)
                    .reduce((sum, area) => sum + area.adds + area.dels, 0)
            },
            changes: {
                features: features.slice(0, 3),
                fixes: fixes.slice(0, 3),
                chores: chores.slice(0, 3)
            },
            areas: Object.entries(metrics.file_changes)
                .map(([name, stats]) => ({
                    name,
                    files: stats.changes,
                    additions: stats.adds,
                    deletions: stats.dels
                }))
                .sort((a, b) => b.files - a.files)
                .slice(0, 3),
            issues_summary: issueSummary,
            questions: [],
            top_contributors: data
                .sort((a, b) => b.score - a.score)
                .slice(0, 3)
                .map(c => ({
                    name: c.contributor,
                    summary: c.summary?.split('.')[0] || '',
                    areas: [...new Set(
                        c.activity.code.pull_requests
                            .filter(pr => pr.merged && pr.files)
                            .flatMap(pr => pr.files.map(f => f.path.split('/')[0]))
                    )].slice(0, 3)
                }))
        };
    } catch (error) {
        console.error('Error generating JSON summary:', error);
        throw error;
    }
}

/**
 * Generate user-facing summary with bullet points
 * @param {Object} metrics - Activity metrics
 * @param {Array} data - Contributor data array
 * @returns {string} Formatted summary
 */
function generateUserSummary(metrics, data) {
    try {
        const changes = data.flatMap(c => 
            c.activity.code.pull_requests.filter(pr => pr.merged)
        );
        
        const date = new Date().toISOString().split('T')[0];
        const overview = generateOverview(metrics, changes, data);
        
        // Count PR types
        const prTypes = changes.reduce((counts, pr) => {
            if (!pr.title.includes(':')) return counts;
            const type = pr.title.split(':')[0].toLowerCase();
            counts[type] = (counts[type] || 0) + 1;
            return counts;
        }, {});
        
        // Get file changes
        const fileChanges = Object.entries(metrics.file_changes)
            .sort(([, a], [, b]) => (b.adds + b.dels) - (a.adds + a.dels))
            .slice(0, 5)
            .map(([area, stats]) => 
                `- **${area}**: ${stats.changes} files (+${stats.adds}/-${stats.dels} lines)`
            );
        
        // Get notable changes
        const notableChanges = changes
            .slice(0, 3)
            .map(pr => `- ${pr.title}`);
        
        // Collect all issues and get label counts
        const allIssues = data.flatMap(c => c.activity.issues.opened);
        const labelCounts = allIssues.reduce((counts, issue) => {
            for (const label of issue.labels || []) {
                counts[label.name] = (counts[label.name] || 0) + 1;
            }
            return counts;
        }, {});
        
        const labelText = Object.entries(labelCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .map(([label, count]) => `\`${label}\` (${count})`)
            .join(', ');
        
        // Get bugs and enhancements
        const bugs = allIssues.filter(issue => 
            issue.labels?.some(label => label.name === 'bug')
        );
        
        const enhancements = allIssues.filter(issue => 
            issue.labels?.some(label => label.name === 'enhancement')
        );
        
        // Generate rich issue summary
        let issueSummary = '';
        if (metrics.basic_metrics.new_issues > 0) {
            const summaries = [];
            if (bugs.length) {
                const bugDetails = bugs
                    .slice(0, 2)
                    .map(issue => `'${issue.title}'`)
                    .join(', ');
                summaries.push(`${bugs.length} bugs reported (including ${bugDetails})`);
            }
            if (enhancements.length) {
                const enhancementDetails = enhancements
                    .slice(0, 2)
                    .map(issue => `'${issue.title}'`)
                    .join(', ');
                summaries.push(`${enhancements.length} feature requests (including ${enhancementDetails})`);
            }
            issueSummary = summaries.join(' ') + '.';
        }

        return `# elizaos/eliza Daily ${date}

## 📊 Overview
${overview}

## 📈 Key Metrics
| Metric | Count |
|---------|--------|
| 👥 Contributors | ${metrics.basic_metrics.contributors} |
| 📝 Commits | ${metrics.basic_metrics.commits} |
| 🔄 Merged PRs | ${metrics.basic_metrics.merged_prs} |
| ⚠️ New Issues | ${metrics.basic_metrics.new_issues} |

## 🔄 Pull Request Summary
- 🧹 **Chores**: ${prTypes.chore || 0}
- 🐛 **Fixes**: ${prTypes.fix || 0}
- ✨ **Features**: ${prTypes.feat || 0}

## 📁 File Changes
${fileChanges.join('\n')}

## 🔥 Notable Changes
${notableChanges.join('\n')}

## 👥 Top Contributors
${getContributorDetails(data).map(c => 
    `- **${c.name}**: ${c.summary}`
).join('\n')}

## ⚠️ Issues
- **New Issues**: ${metrics.basic_metrics.new_issues}
- **Labels**: ${labelText}
- **Summary**: ${issueSummary}`;
    } catch (error) {
        console.error('Error generating user summary:', error);
        throw error;
    }
}

/**
 * Main function to process and generate summaries
 * @param {Object} options - Command line options
 */
async function main({ inputFile, outputFile, type = 'md' }) {
    try {
      // Load input
      const fileContent = await fs.readFile(inputFile, 'utf8');
      const data = JSON.parse(fileContent);
  
      // Calculate metrics
      const metrics = analyzeActivityMetrics(data);
  
      // Generate summary
      let summary;
      if (type === 'json') {
        summary = JSON.stringify(generateJsonSummary(metrics, data), null, 2);
      } else {
        summary = generateUserSummary(metrics, data);
      }
  
      // Preserve directory in finalOutputFile
      const ext = path.extname(outputFile);                 // e.g. ".json"
      const dir = path.dirname(outputFile);                 // e.g. "data/daily"
      const name = path.basename(outputFile, ext);          // e.g. "summary"
      const finalOutputFile = path.join(dir, `${name}.${type}`);
  
      // Write result
      await fs.writeFile(finalOutputFile, summary);
      console.log(`\nSummary saved to ${finalOutputFile}`);
  
      // Print user-facing summary on console if markdown
      if (type === 'md') {
        console.log('\nUser-facing summary:');
        console.log('-'.repeat(50));
        console.log(generateUserSummary(metrics, data));
      }
      
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  }

// Command line handling
    import('yargs')
        .then(({ default: yargs }) => {
            const argv = yargs(process.argv.slice(2))
                .option('type', {
                    alias: 't',
                    choices: ['md', 'json'],
                    default: 'md',
                    describe: 'Output format type (markdown or json)'
                })
                .usage('Usage: $0 <input_file> <output_file> [options]')
                .demandCommand(2)
                .argv;

            const [inputFile, outputFile] = argv._;
            main({
                inputFile,
                outputFile,
                type: argv.type
            }).catch(console.error);
        });

export {
    analyzeActivityMetrics,
    generateJsonSummary,
    generateOverview,
    generateUserSummary,
    getContributorDetails,
    main
};
