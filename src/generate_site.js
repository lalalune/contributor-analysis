import fs from 'fs/promises';
import path from 'path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { fileURLToPath } from 'url';
import ContributorProfile from './components/ContributorProfile.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function to truncate text with ellipsis
const truncateText = (text, maxLength) => {
    if (!text || text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + '...';
};

const ContributorComponentsScript = `
const StatusDot = ({ status }) => {
  const colors = {
    open: 'bg-green-500',
    closed: 'bg-red-500',
    merged: 'bg-purple-500'
  };

  return React.createElement('span', {
    className: \`inline-block w-2 h-2 rounded-full \${colors[status]} mr-2\`
  });
};

const ActivitySection = ({ title, items = [], showStatus = false }) => {
  const [isExpanded, setIsExpanded] = React.useState(false);
  
  const getStatus = (item) => {
    if (item.state === 'merged' || (item.state === 'closed' && title === 'Pull Requests')) {
      return 'merged';
    }
    return item.state || 'open';
  };

  return React.createElement('div', { className: 'border rounded-lg p-4' },
    React.createElement('div', {
      className: 'flex items-center justify-between cursor-pointer',
      onClick: () => setIsExpanded(!isExpanded)
    },
      React.createElement('h3', { className: 'font-semibold' }, title),
      React.createElement('span', null, isExpanded ? '▼' : '▶')
    ),
    isExpanded && React.createElement('div', { className: 'mt-4 space-y-2' },
      items.map((item, index) => 
        React.createElement('div', { key: index, className: 'p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded' },
          React.createElement('a', {
            href: item.url,
            target: '_blank',
            rel: 'noopener noreferrer',
            className: 'text-sm hover:text-blue-500 flex flex-col gap-1'
          },
            React.createElement('span', { className: 'font-medium flex items-center' },
              showStatus && React.createElement(StatusDot, { status: getStatus(item) }),
              item.message || item.title || item.body
            ),
            React.createElement('span', { className: 'text-gray-500 text-xs' },
              new Date(item.date || item.created_at).toLocaleDateString()
            )
          )
        )
      )
    )
  );
};

const StatCard = ({ name, value }) => {
  return React.createElement('div', { className: 'bg-white dark:bg-gray-800 rounded-lg p-6 shadow' },
    React.createElement('h3', { className: 'font-semibold' }, name),
    React.createElement('p', { className: 'text-2xl font-bold' }, value)
  );
};

const ContributorProfile = ({ data }) => {
  const stats = [
    { name: 'Commits', value: data.activity.code.total_commits },
    { name: 'Pull Requests', value: data.activity.code.total_prs },
    { name: 'Issues', value: data.activity.issues.total_opened },
    { name: 'Comments', value: data.activity.engagement.total_comments }
  ];

  return React.createElement('div', { className: 'max-w-7xl mx-auto p-4 space-y-6' },
    React.createElement('div', { className: 'bg-white dark:bg-gray-800 rounded-lg p-6 shadow' },
      React.createElement('div', { className: 'flex items-center justify-between' },
        React.createElement('div', { className: 'flex items-center gap-4' },
          React.createElement('img', {
            src: data.avatar_url,
            alt: \`\${data.contributor}'s avatar\`,
            className: 'w-16 h-16 rounded-full'
          }),
          React.createElement('div', null,
            React.createElement('h1', { className: 'text-2xl font-bold' }, data.contributor),
            React.createElement('div', { className: 'text-gray-600 dark:text-gray-400' },
              React.createElement('span', { className: 'font-semibold' }, 'Score: '),
              data.score
            )
          )
        )
      )
    ),

    data.summary && React.createElement('div', { 
      className: 'bg-white dark:bg-gray-800 rounded-lg p-6 shadow'
    },
      React.createElement('p', { 
        className: 'text-gray-700 dark:text-gray-300 text-sm leading-relaxed'
      }, data.summary)
    ),

    React.createElement('div', { className: 'grid grid-cols-1 md:grid-cols-4 gap-4' },
      stats.map(stat => React.createElement(StatCard, { 
        key: stat.name,
        ...stat
      }))
    ),

    React.createElement('div', { className: 'space-y-4' },
      React.createElement(ActivitySection, {
        title: 'Commits',
        items: data.activity.code.commits
      }),
      React.createElement(ActivitySection, {
        title: 'Pull Requests',
        items: data.activity.code.pull_requests,
        showStatus: true
      }),
      React.createElement(ActivitySection, {
        title: 'Issues',
        items: data.activity.issues.opened || [],
        showStatus: true
      }),
      React.createElement(ActivitySection, {
        title: 'Comments',
        items: data.activity.engagement.comments
      })
    )
  );
};

// Initialize React root and render
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(ContributorProfile, { data: window.__DATA__ }));`;

const template = (content, data) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${data.contributor} - GitHub Contributions</title>
    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
</head>
<body class="bg-gray-50 dark:bg-gray-900">
    <div id="root">${content}</div>
    <script>
        window.__DATA__ = ${JSON.stringify(data)};
    </script>
    <script type="text/javascript">
        ${ContributorComponentsScript}
    </script>
</body>
</html>`;

const generateSite = async () => {
    const inputDir = path.join(path.dirname(__dirname), 'data');
    const outputDir = path.join(path.dirname(__dirname), 'profiles');

    try {
        await fs.mkdir(outputDir, { recursive: true });
        
        // Read contributors.json
        const contributorsData = JSON.parse(
            await fs.readFile(path.join(inputDir, 'contributors.json'), 'utf-8')
        );

        // Generate individual profile pages
        for (const data of contributorsData) {
            const content = renderToString(
                React.createElement(ContributorProfile, { data })
            );
            
            const html = template(content, data);
            
            await fs.writeFile(
                path.join(outputDir, `${data.contributor}.html`),
                html
            );
            
            console.log(`Generated profile for ${data.contributor}`);
        }

        // Generate index.html
        const indexContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GitHub Contributors</title>
    <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
</head>
<body class="bg-gray-50 dark:bg-gray-900">
    <div class="max-w-7xl mx-auto p-8">
        <h1 class="text-3xl font-bold mb-8 text-gray-900 dark:text-white">GitHub Contributors</h1>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            ${contributorsData.map(data => `
                <a href="${data.contributor}.html" 
                   class="block p-6 bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-lg transition-shadow relative">
                    <div class="absolute top-4 right-4 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-3 py-1 rounded-full text-sm font-semibold">
                        Score: ${data.score}
                    </div>
                    <div class="flex items-center gap-4 mb-4">
                        <img src="${data.avatar_url}" 
                             alt="${data.contributor}" 
                             class="w-12 h-12 rounded-full">
                        <div>
                            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">${data.contributor}</h2>
                            <p class="text-gray-600 dark:text-gray-400">
                                ${data.activity.code.total_commits} commits
                            </p>
                        </div>
                    </div>
                    ${data.summary ? `
                        <p class="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                            ${truncateText(data.summary, 140)}
                        </p>
                    ` : ''}
                    <div class="mt-4 flex justify-between text-sm text-gray-500 dark:text-gray-400">
                        <span>${data.activity.code.total_commits} commits</span>
                        <span>${data.activity.code.total_prs} PRs</span>
                        <span>${data.activity.issues.total_opened} issues</span>
                    </div>
                </a>
            `).join('')}
        </div>
    </div>
</body>
</html>`;

        await fs.writeFile(path.join(outputDir, 'index.html'), indexContent);

        console.log('Site generation complete! Open ./profiles/index.html to view the result.');
    } catch (error) {
        console.error('Error generating site:', error);
        console.error(error.stack);
    }
};

generateSite();
