window.BOOK = {
  slug: 'franklin',
  title: 'Feedback Control of Dynamic Systems',
  short: 'Franklin 自控原理',
  subtitle: '自动控制原理复习演示',
  authors: 'Gene F. Franklin · J. David Powell · Abbas Emami-Naeini',
  // 前置页：排在左栏「总览」之后、各章之前（每本书都可以有）
  front: [
    { id: 'knowledge', title: '知识点速查', zh: '做题时卡住就来这查' }
  ],
  chapters: [
    { id: 'ch01', num: 'Ch1', title: 'An Overview and Brief History of Feedback Control', zh: '绪论与反馈控制简史', status: 'gap' },
    { id: 'ch02', num: 'Ch2', title: 'Dynamic Models', zh: '动态模型', status: 'gap' },
    { id: 'ch03', num: 'Ch3', title: 'Dynamic Response', zh: '动态响应', status: 'partial',
      sections: [
        { id: 'ch03-system-modeling', title: 'System Modeling Diagrams', zh: '系统建模图', status: 'partial' },
        { id: 'ch03-time-specs', title: 'Time-Domain Specifications', zh: '时域指标', status: 'partial' }
      ] },
    { id: 'ch04', num: 'Ch4', title: 'A First Analysis of Feedback', zh: '反馈的初步分析', status: 'gap' },
    { id: 'ch05', num: 'Ch5', title: 'The Root-Locus Design Method', zh: '根轨迹设计法', status: 'gap' },
    { id: 'ch06', num: 'Ch6', title: 'The Frequency-Response Design Method', zh: '频率响应设计法', status: 'gap' },
    { id: 'ch07', num: 'Ch7', title: 'State-Space Design', zh: '状态空间设计', status: 'gap' },
    { id: 'ch08', num: 'Ch8', title: 'Digital Control', zh: '数字控制', status: 'gap' },
    { id: 'ch09', num: 'Ch9', title: 'Nonlinear Systems', zh: '非线性系统', status: 'gap' },
    { id: 'ch10', num: 'Ch10', title: 'Control System Design: Principles and Case Studies', zh: '控制系统设计：原理与案例', status: 'gap' },
    { id: 'appendix', num: 'App', title: 'Appendices', zh: '附录（拉氏变换表 / 习题解答 / MATLAB 命令）', status: 'gap' }
  ]
};
