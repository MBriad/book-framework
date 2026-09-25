window.BOOK = {
  slug: 'mybook',
  title: '书名（English Title）',
  short: '简称',
  subtitle: '副标题',
  authors: '作者',
  // 前置页：排在左栏「总览」之后、各章之前（每本书都可以有）
  front: [
    { id: 'knowledge', title: '知识点速查', zh: '做题时卡住就来这查' }
  ],
  chapters: [
    { id: 'ch01', num: 'Ch1', title: 'Chapter Title', zh: '中文副题', status: 'gap' }
  ]
};
