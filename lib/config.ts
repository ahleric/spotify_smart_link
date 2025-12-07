// 静态配置：用户可在此文件调整内容，无需数据库。
export const releaseData = {
  artistName: 'Mola Oddity',
  trackTitle: 'HALF A SADDAY SAVING TIME',
  coverImage: '/cover.jpg',
  spotifyDeepLink: 'spotify://track/0dOp6hAL0Vf6lYk9UU3Uhn',
  spotifyWebLink: 'https://open.spotify.com/track/0dOp6hAL0Vf6lYk9UU3Uhn?si=fc784f6962fc424a',
  metaPixelId: '1382043723511910',
  // 优先从环境变量读取，若需要也可直接填入提供的 token。
  facebookAccessToken:
    process.env.FB_ACCESS_TOKEN ??
    'EAA9vzGJqe2sBQIDWZBiZAp5Dhh88vtZAc0XU5tTiuUPsgYOOfC5vDJCa2oYj0QZBOZBhteaTy9r0JuZAnGc1Ky3kYwMcl94OaHZBP7JZCpTfotNVvEZAzJXhhAc3RVcZBkXgNtrXaLna9kn2MvqsibfI9y79jaGZAeOWZAbxqt5H1uuYOXm5F1N20RZB6uZBnLBRZAxpAZDZD',
} as const;

export type ReleaseData = typeof releaseData;
