/**
 * AI Daily Briefing - Information Categories
 *
 * 用途：
 * 1. 定义每日资讯的栏目
 * 2. 描述每个栏目的关注范围
 * 3. 提供推荐信息来源
 * 4. 为 AI 搜索和筛选新闻提供参考
 *
 * 注意：
 * - sources 只是推荐来源，不代表每天必须全部搜索
 * - AI 应优先选择权威、一手、近期的信息
 * - source.type:
 *   official  = 官方来源
 *   media     = 科技媒体
 *   community = 社区/社交媒体
 *   database  = 数据库/产品平台
 */

export const categories = [

  {
    id: "ai",
    name: "人工智能",
    description:
      "关注 AI 模型、AI 产品、AI 公司、AI Agent、生成式 AI、AI 编程、AI 应用、AI 基础设施以及重要研究进展。重点关注过去24小时内具有实际影响或较高关注价值的信息。",

    keywords: [
      "AI",
      "LLM",
      "大语言模型",
      "生成式AI",
      "AI Agent",
      "多模态",
      "AI编程",
      "AI应用",
      "AI芯片"
    ],

    sources: [
      {
        name: "OpenAI",
        type: "official",
        description: "OpenAI 官方产品、模型、API 和重要公告"
      },
      {
        name: "Anthropic",
        type: "official",
        description: "Claude、模型和 AI 安全相关信息"
      },
      {
        name: "Google DeepMind",
        type: "official",
        description: "Gemini、AI 研究和模型进展"
      },
      {
        name: "Meta AI",
        type: "official",
        description: "Llama 和 Meta AI 相关信息"
      },
      {
        name: "Microsoft",
        type: "official",
        description: "Copilot、Azure AI 和 AI 产品动态"
      },
      {
        name: "NVIDIA",
        type: "official",
        description: "AI GPU、CUDA、AI 基础设施和芯片信息"
      },
      {
        name: "Hugging Face",
        type: "community",
        description: "开源模型、数据集和 AI 社区动态"
      },
      {
        name: "GitHub",
        type: "community",
        description: "热门 AI 开源项目和开发者生态"
      },
      {
        name: "量子位",
        type: "media",
        description: "中国 AI 行业新闻和产品动态"
      },
      {
        name: "机器之心",
        type: "media",
        description: "AI 研究、模型和产业新闻"
      }
    ]
  },


  {
    id: "digital_products",
    name: "数码产品",
    description:
      "关注手机、电脑、平板、耳机、智能手表、相机、显示器、显卡、处理器以及其他消费电子产品。重点关注新品发布、硬件升级、价格变化、爆料和重要技术变化。",

    keywords: [
      "手机",
      "电脑",
      "Mac",
      "iPhone",
      "iPad",
      "Android",
      "Windows",
      "显卡",
      "CPU",
      "平板",
      "耳机",
      "显示器",
      "相机"
    ],

    sources: [
      {
        name: "Apple",
        type: "official",
        description: "Apple 官方产品发布和软件更新"
      },
      {
        name: "Microsoft",
        type: "official",
        description: "Windows、Surface 和相关产品信息"
      },
      {
        name: "Google",
        type: "official",
        description: "Pixel、Android 和 Google 硬件产品"
      },
      {
        name: "NVIDIA",
        type: "official",
        description: "GPU、显卡和相关技术信息"
      },
      {
        name: "AMD",
        type: "official",
        description: "CPU、GPU 和平台技术信息"
      },
      {
        name: "Intel",
        type: "official",
        description: "处理器和 PC 平台信息"
      },
      {
        name: "数码闲聊站",
        type: "community",
        description: "手机、芯片等消费电子领域爆料和行业信息"
      },
      {
        name: "IT之家",
        type: "media",
        description: "国内外消费电子和科技新闻"
      },
      {
        name: "The Verge",
        type: "media",
        description: "消费电子、互联网和科技产品新闻"
      },
      {
        name: "Ars Technica",
        type: "media",
        description: "硬件、软件和技术深度报道"
      }
    ]
  },


  {
    id: "tech_companies",
    name: "科技公司",
    description:
      "关注全球主要科技公司的产品、财报、战略调整、并购、裁员、融资、重大合作、管理层变化以及商业模式变化。",

    keywords: [
      "科技公司",
      "财报",
      "融资",
      "收购",
      "并购",
      "裁员",
      "IPO",
      "战略合作"
    ],

    sources: [
      {
        name: "Reuters",
        type: "media",
        description: "科技公司商业新闻和重大事件"
      },
      {
        name: "Bloomberg",
        type: "media",
        description: "科技公司、金融和商业动态"
      },
      {
        name: "The Information",
        type: "media",
        description: "科技公司和互联网行业深度报道"
      },
      {
        name: "SEC",
        type: "official",
        description: "美国上市公司监管文件和财务信息"
      },
      {
        name: "各公司 Investor Relations",
        type: "official",
        description: "公司财报、业绩公告和投资者信息"
      }
    ]
  },


  {
    id: "china_tech",
    name: "中国科技",
    description:
      "关注中国大陆 AI、互联网、消费电子、芯片、汽车、机器人、通信以及科技政策。重点关注具有行业影响力和实际价值的信息。",

    keywords: [
      "中国科技",
      "国产AI",
      "国产芯片",
      "互联网",
      "新能源汽车",
      "机器人",
      "科技政策"
    ],

    sources: [
      {
        name: "国家互联网信息办公室",
        type: "official",
        description: "互联网和 AI 相关政策信息"
      },
      {
        name: "工业和信息化部",
        type: "official",
        description: "工业、芯片、通信和科技产业政策"
      },
      {
        name: "中国政府网",
        type: "official",
        description: "重要政策和官方信息"
      },
      {
        name: "36氪",
        type: "media",
        description: "中国科技、创业和互联网行业动态"
      },
      {
        name: "机器之心",
        type: "media",
        description: "中国 AI 行业和研究动态"
      },
      {
        name: "量子位",
        type: "media",
        description: "中国 AI 和科技产业新闻"
      },
      {
        name: "数码闲聊站",
        type: "community",
        description: "中国手机及消费电子产业爆料"
      }
    ]
  },


  {
    id: "open_source",
    name: "开源与开发者",
    description:
      "关注 GitHub 热门项目、开源 AI 模型、开发工具、编程框架、数据库、操作系统以及值得开发者关注的新项目。",

    keywords: [
      "GitHub",
      "开源",
      "Open Source",
      "开发工具",
      "编程",
      "SDK",
      "API",
      "框架",
      "数据库"
    ],

    sources: [
      {
        name: "GitHub",
        type: "community",
        description: "开源项目、Trending 和开发者生态"
      },
      {
        name: "Hugging Face",
        type: "community",
        description: "开源 AI 模型和数据集"
      },
      {
        name: "GitLab",
        type: "community",
        description: "开源项目和开发工具"
      },
      {
        name: "Product Hunt",
        type: "community",
        description: "新产品和开发者工具"
      },
      {
        name: "Stack Overflow",
        type: "community",
        description: "开发者生态和技术趋势"
      }
    ]
  },


  {
    id: "free_deals",
    name: "免费与低价福利",
    description:
      "关注可以免费或低成本使用的 AI、软件、云服务、开发工具、会员、API、GPU、教育资源以及限时优惠。优先关注真实可用、具有实际价值的福利。",

    keywords: [
      "免费",
      "Free",
      "优惠",
      "限时",
      "免费API",
      "免费模型",
      "免费GPU",
      "学生优惠",
      "开发者优惠"
    ],

    sources: [
      {
        name: "各产品官方活动页面",
        type: "official",
        description: "优先确认优惠真实性和有效期"
      },
      {
        name: "GitHub",
        type: "community",
        description: "开发者免费资源和开源项目"
      },
      {
        name: "Product Hunt",
        type: "community",
        description: "新产品和限时活动"
      },
      {
        name: "Reddit",
        type: "community",
        description: "用户发现的免费资源和优惠信息"
      }
    ]
  },


  {
    id: "research",
    name: "科技研究",
    description:
      "关注值得关注的 AI、计算机、芯片、机器人、材料、通信等领域科研成果。优先选择具有潜在产业影响或技术突破意义的研究。",

    keywords: [
      "论文",
      "研究",
      "Research",
      "突破",
      "Nature",
      "Science",
      "arXiv"
    ],

    sources: [
      {
        name: "arXiv",
        type: "database",
        description: "最新计算机和 AI 学术论文"
      },
      {
        name: "Nature",
        type: "media",
        description: "高影响力科研成果"
      },
      {
        name: "Science",
        type: "media",
        description: "重要科学研究"
      },
      {
        name: "Google Scholar",
        type: "database",
        description: "学术论文检索"
      }
    ]
  },


  {
    id: "space_robotics",
    name: "机器人与航天",
    description:
      "关注人形机器人、工业机器人、自动驾驶、无人机、航天发射、卫星、SpaceX 等前沿科技领域。",

    keywords: [
      "机器人",
      "人形机器人",
      "自动驾驶",
      "无人机",
      "航天",
      "火箭",
      "卫星"
    ],

    sources: [
      {
        name: "SpaceX",
        type: "official",
        description: "火箭、Starship、卫星和航天任务"
      },
      {
        name: "NASA",
        type: "official",
        description: "航天任务和科学研究"
      },
      {
        name: "中国国家航天局",
        type: "official",
        description: "中国航天任务和航天科技"
      },
      {
        name: "Tesla",
        type: "official",
        description: "机器人、自动驾驶等相关技术"
      },
      {
        name: "IEEE Spectrum",
        type: "media",
        description: "机器人、工程和前沿技术"
      }
    ]
  }

];

export default categories;
