// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';
import starlightLlmsTxt from 'starlight-llms-txt';
import rehypeTableWrap from './src/plugins/rehype-table-wrap.mjs';

export default defineConfig({
	site: 'https://docs.licensemeter.com',
	trailingSlash: 'always',
	markdown: {
		rehypePlugins: [rehypeTableWrap],
	},
	integrations: [
		starlight({
			title: 'LicenseMeter Docs',
			description: 'Find unused software licenses, review SaaS access, and track AI API costs with LicenseMeter.',
			logo: {
				light: './src/assets/logo-light.svg',
				dark: './src/assets/logo-dark.svg',
				alt: 'LicenseMeter',
			},
			favicon: '/favicon.svg',
			head: [
				{ tag: 'link', attrs: { rel: 'icon', href: '/favicon.ico', sizes: '32x32' } },
				{ tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' } },
				{ tag: 'meta', attrs: { name: 'theme-color', content: '#ffffff', media: '(prefers-color-scheme: light)' } },
				{ tag: 'meta', attrs: { name: 'theme-color', content: '#0f1216', media: '(prefers-color-scheme: dark)' } },
			],
			customCss: ['@fontsource-variable/geist', './src/styles/custom.css'],
			expressiveCode: {
				// Plain rounded frames like GitBook: no terminal window chrome on shell snippets.
				defaultProps: { frame: 'code' },
				styleOverrides: {
					borderRadius: '0.75rem',
					borderColor: 'var(--sl-color-hairline-light)',
					codeFontSize: '0.8125rem',
					codeLineHeight: '1.7',
					codePaddingBlock: '1rem',
					codePaddingInline: '1.25rem',
					uiFontFamily: 'var(--__sl-font)',
					frames: {
						frameBoxShadowCssValue: 'none',
						editorActiveTabIndicatorTopColor: 'transparent',
					},
				},
			},
			components: {
				SocialIcons: './src/components/HeaderLinks.astro',
				PageTitle: './src/components/PageTitle.astro',
			},
			lastUpdated: false,
			// The self-hosting guide links to http://localhost:3000 on purpose.
			plugins: [starlightLinksValidator({ errorOnLocalLinks: false }), starlightLlmsTxt()],
			// Mirrors docs/gitbook/SUMMARY.md.
			sidebar: [
				{ label: 'Welcome', link: '/' },
				{
					label: 'Getting started',
					items: [
						{ label: 'Overview', slug: 'getting-started' },
						{ label: 'Before you start', slug: 'getting-started/before-you-start' },
						{ label: 'Sign in and find your workspace', slug: 'getting-started/sign-in' },
						{ label: 'Import Microsoft CSV exports', slug: 'getting-started/csv-import' },
						{ label: 'Run an instant scan', slug: 'getting-started/instant-scan' },
						{ label: 'Verify your first sync', slug: 'getting-started/first-sync' },
						{ label: 'Review your first finding', slug: 'getting-started/first-review' },
						{ label: 'Explore the sample workspace', slug: 'getting-started/sample-workspace' },
					],
				},
				{
					label: 'Workspace and dashboard',
					items: [
						{ label: 'Overview', slug: 'workspace' },
						{ label: 'Roles and access', slug: 'workspace/roles' },
						{ label: 'Invite colleagues and manage access', slug: 'workspace/members' },
						{ label: 'Settings and sync history', slug: 'workspace/settings' },
						{ label: 'Emails from LicenseMeter', slug: 'workspace/emails' },
					],
				},
				{
					label: 'Review findings',
					items: [
						{ label: 'Overview', slug: 'findings' },
						{ label: 'Detection rules', slug: 'findings/rules' },
						{ label: 'Remediation workflow', slug: 'findings/workflow' },
					],
				},
				{ label: 'Licenses and prices', slug: 'licenses-and-prices' },
				{
					label: 'Connectors',
					items: [
						{ label: 'Overview', slug: 'connectors' },
						{ label: 'Microsoft 365', slug: 'connectors/microsoft' },
						{ label: 'Connect with managed consent', slug: 'connectors/microsoft-managed' },
						{ label: 'Connect with your own app', slug: 'connectors/microsoft-byo' },
						{ label: 'Adobe', slug: 'connectors/adobe' },
						{ label: 'Zoom', slug: 'connectors/zoom' },
						{ label: 'Atlassian', slug: 'connectors/atlassian' },
						{ label: 'Salesforce', slug: 'connectors/salesforce' },
						{ label: 'OpenAI', slug: 'connectors/openai' },
						{ label: 'Anthropic', slug: 'connectors/anthropic' },
						{ label: 'ChatGPT', slug: 'connectors/chatgpt' },
						{ label: 'Claude', slug: 'connectors/claude' },
					],
				},
				{ label: 'AI API costs', slug: 'ai-costs' },
				{ label: 'Exports and reports', slug: 'exports' },
				{ label: 'Renewal calendar', slug: 'renewals' },
				{
					label: 'Self-hosting with Docker',
					items: [
						{ label: 'Overview', slug: 'self-hosting' },
						{ label: 'Microsoft application setup', slug: 'self-hosting/microsoft-setup' },
					],
				},
				{
					label: 'Troubleshooting',
					items: [
						{ label: 'Overview', slug: 'troubleshooting' },
						{ label: 'Report privacy and detection coverage', slug: 'troubleshooting/report-privacy' },
					],
				},
			],
		}),
	],
});
