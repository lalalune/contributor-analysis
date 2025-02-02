import fs from 'fs/promises';
import path from 'path';

function createContributorDict(username, avatarUrl = null) {
    return {
        contributor: username,
        score: 0,
        summary: '',
        avatar_url: avatarUrl,
        activity: {
            code: {
                total_commits: 0,
                total_prs: 0,
                commits: [],
                pull_requests: []
            },
            issues: {
                total_opened: 0,
                opened: []
            },
            engagement: {
                total_comments: 0,
                total_reviews: 0,
                comments: [],
                reviews: []
            }
        }
    };
}

async function combineActivity(prsData, issuesData, commitsData = null) {
    const contributors = new Map();
    console.log(`\nProcessing ${prsData.length} PRs...`);
    
    // Process PRs
    for (const pr of prsData) {
        const authorData = pr.author;
        if (!authorData) continue;
        
        const author = authorData.login;
        const avatarUrl = authorData.avatarUrl;
        
        if (!contributors.has(author)) {
            contributors.set(author, createContributorDict(author, avatarUrl));
            console.log(`Added new contributor: ${author}`);
        }
        
        const contrib = contributors.get(author);
        
        // Enhanced PR data with more metadata
        const prData = {
            number: pr.number,
            title: pr.title,
            state: pr.state,
            merged: pr.merged ?? false,
            created_at: pr.createdAt,
            updated_at: pr.updatedAt,
            body: pr.body ?? '',
            files: (pr.files ?? []).map(f => ({
                path: f.path,
                additions: f.additions,
                deletions: f.deletions
            })),
            reviews: (pr.reviews ?? []).map(r => ({
                author: r.author,
                state: r.state,
                body: r.body
            })),
            comments: (pr.comments ?? []).map(c => ({
                author: c.author,
                body: c.body
            }))
        };
        
        contrib.activity.code.pull_requests.push(prData);
        contrib.activity.code.total_prs++;
        contrib.activity.engagement.total_reviews += (pr.reviews ?? []).length;
    }
    
    console.log(`\nProcessing ${issuesData.length} issues...`);
    // Process issues
    for (const issue of issuesData) {
        const authorData = issue.author;
        if (!authorData) continue;
        
        const author = authorData.login;
        const avatarUrl = authorData.avatarUrl;
        
        if (!contributors.has(author)) {
            contributors.set(author, createContributorDict(author, avatarUrl));
            console.log(`Added new contributor: ${author}`);
        }
        
        const contrib = contributors.get(author);
        
        // Enhanced issue data
        const issueData = {
            number: issue.number,
            title: issue.title,
            state: issue.state,
            created_at: issue.createdAt,
            updated_at: issue.updatedAt,
            body: issue.body ?? '',
            labels: (issue.labels ?? []).map(l => ({
                name: l.name,
                color: l.color,
                description: l.description
            })),
            comments: (issue.comments ?? []).map(c => ({
                author: c.author,
                body: c.body
            }))
        };
        
        contrib.activity.issues.opened.push(issueData);
        contrib.activity.issues.total_opened++;
        contrib.activity.engagement.total_comments += (issue.comments ?? []).length;
    }
    
    if (commitsData) {
        console.log(`\nProcessing ${commitsData.length} commits...`);
        for (const commit of commitsData) {
            const authorData = commit.author?.user;
            if (!authorData) continue;
            
            const author = authorData.login;
            if (!author) continue;
            
            if (!contributors.has(author)) {
                contributors.set(author, createContributorDict(author));
                console.log(`Added new contributor: ${author}`);
            }
            
            const contrib = contributors.get(author);
            
            // Enhanced commit data
            const commitData = {
                sha: commit.sha,
                message: commit.message,
                created_at: commit.committedDate,
                additions: commit.additions ?? 0,
                deletions: commit.deletions ?? 0,
                changed_files: commit.changedFiles ?? 0
            };
            
            contrib.activity.code.commits.push(commitData);
            contrib.activity.code.total_commits++;
        }
    }
    
    // Convert Map to Array and sort by activity level
    const result = Array.from(contributors.values());
    result.sort((a, b) => {
        const aActivity = a.activity.code.commits.length + a.activity.code.pull_requests.length;
        const bActivity = b.activity.code.commits.length + b.activity.code.pull_requests.length;
        return bActivity - aActivity;
    });
    
    return result;
}

async function main(options) {
    console.log('\nLoading data from files...');
    
    let prsData, issuesData, commitsData;
    
    try {
        // Load PR data
        console.log(`Loading PRs from ${options.prs}...`);
        const prsContent = await fs.readFile(options.prs, 'utf8');
        prsData = JSON.parse(prsContent);
        console.log(`Loaded ${prsData.length} PRs`);
        
        // Load issues data
        console.log(`Loading issues from ${options.issues}...`);
        const issuesContent = await fs.readFile(options.issues, 'utf8');
        issuesData = JSON.parse(issuesContent);
        console.log(`Loaded ${issuesData.length} issues`);
        
        // Load optional commits data
        if (options.commits) {
            console.log(`Loading commits from ${options.commits}...`);
            const commitsContent = await fs.readFile(options.commits, 'utf8');
            commitsData = JSON.parse(commitsContent);
            console.log(`Loaded ${commitsData.length} commits`);
        }
        
        // Combine activity data
        console.log('\nCombining data...');
        const contributors = await combineActivity(prsData, issuesData, commitsData);
        
        // Create data directory if it doesn't exist
        const dataDir = options.dataDir || 'data';
        await fs.mkdir(dataDir, { recursive: true });
        
        // Write to specified output file
        console.log(`\nWriting output to ${options.output}`);
        await fs.writeFile(options.output, JSON.stringify(contributors, null, 2));
        
        // Print summary
        console.log(`\nProcessed ${contributors.length} contributors`);
        return true;
        
    } catch (error) {
        console.error('Error in combine.js:', error);
        throw error;
    }
}

// Command line handling
if (process.argv[1].endsWith('combine.js')) {
    console.log('Parsing command line arguments...');
    
    import('yargs')
        .then(({ default: yargs }) => {
            const argv = yargs(process.argv.slice(2))
                .option('prs', {
                    alias: 'p',
                    describe: 'PRs JSON file',
                    type: 'string',
                    demandOption: true
                })
                .option('issues', {
                    alias: 'i',
                    describe: 'Issues JSON file',
                    type: 'string',
                    demandOption: true
                })
                .option('commits', {
                    alias: 'c',
                    describe: 'Commits JSON file',
                    type: 'string'
                })
                .option('output', {
                    alias: 'o',
                    describe: 'Output JSON file',
                    type: 'string',
                    demandOption: true
                })
                .option('data-dir', {
                    describe: 'Directory for output files',
                    type: 'string',
                    default: 'data'
                })
                .argv;

            main(argv).catch(error => {
                console.error('Error executing combine.js:', error);
                process.exit(1);
            });
        })
        .catch(error => {
            console.error('Error importing yargs:', error);
            process.exit(1);
        });
}

export { main, combineActivity, createContributorDict };