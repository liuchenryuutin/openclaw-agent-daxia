#!/usr/bin/env node
// Create a Feishu doc with categorized news data - FIXED block types

const APP_ID = 'cli_a93fda4918f89bdf';
const APP_SECRET = 'kIlF3hAcZkqWsQkGMcjSEhvGwfWOOTBQ';
const OWNER_OPEN_ID = 'ou_8462b401def44e3db8a04e4a52a67fff';

async function getAccessToken() {
  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET })
  });
  const data = await res.json();
  return data.tenant_access_token;
}

async function createDoc(token, title) {
  const res = await fetch('https://open.feishu.cn/open-apis/docx/v1/documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ title })
  });
  const data = await res.json();
  console.log('Create doc:', data.code === 0 ? 'OK' : data.msg, data.data?.document?.document_id);
  return data.data?.document?.document_id;
}

async function batchInsert(token, docId, blocks) {
  const res = await fetch(`https://open.feishu.cn/open-apis/docx/v1/documents/${docId}/blocks/${docId}/children`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ children: blocks })
  });
  const data = await res.json();
  if (data.code !== 0) {
    console.error('  ERR:', data.msg, JSON.stringify(data).substring(0, 150));
  }
  return data;
}

// Correct block types from Feishu docx API:
// 2=Text, 3=Heading1, 4=Heading2, 5=Heading3, 12=Bullet, 13=Ordered, 15=Quote, 22=Divider

function heading1(text) {
  return { block_type: 3, heading1: { elements: [{ text_run: { content: text } }] } };
}
function heading2(text) {
  return { block_type: 4, heading2: { elements: [{ text_run: { content: text } }] } };
}
function heading3(text) {
  return { block_type: 5, heading3: { elements: [{ text_run: { content: text } }] } };
}
function text(text) {
  return { block_type: 2, text: { elements: [{ text_run: { content: text } }] } };
}
function bullet(text) {
  return { block_type: 12, bullet: { elements: [{ text_run: { content: text } }] } };
}
function divider() {
  return { block_type: 22, divider: {} };
}

const categories = [
  {
    name: '一、时政要闻',
    sources: [
      { site: '新浪', items: [
        ['中方制裁会否影响鲁比奥访华？外交部回应', 'https://news.sina.com.cn/c/2026-03-16/doc-inhrezkh5787405.shtml'],
        ['中美经贸磋商在法国巴黎结束', 'https://news.sina.com.cn/c/2026-03-16/doc-inhrevak5905643.shtml'],
        ['李家超：正全速制定首份"香港五年规划"', 'https://news.sina.com.cn/c/2026-03-16/doc-inhrevan2659495.shtml'],
        ['永辉发公开信喊话山姆：不要让供应商"二选一"', 'https://news.sina.com.cn/c/2026-03-16/doc-inhrevak5872888.shtml'],
        ['李强主持召开国务院第十一次全体会议', 'https://news.sina.com.cn/c/2026-03-16/doc-inhrevan2649851.shtml'],
        ['中国援助伊朗人道主义物资完成交接', 'https://news.sina.com.cn/c/2026-03-16/doc-inhrequn5936889.shtml'],
        ['上海市调整商业用房购房贷款最低首付款比例政策', 'https://news.sina.com.cn/c/2026-03-16/doc-inhrequq2675000.shtml'],
        ['"伊朗战事持续会影响中国能源供应"，外交部回应', 'https://news.sina.com.cn/c/2026-03-16/doc-inhreknu9900359.shtml'],
        ['民调：特朗普的"破坏性政策"正将美国盟友推向中国', 'https://news.sina.com.cn/c/2026-03-16/doc-inhreknt8840978.shtml'],
        ['外交部：中美双方就特朗普总统访华事保持着沟通', 'https://news.sina.com.cn/o/2026-03-16/doc-inhreknt8828220.shtml'],
        ['涉泡泡玛特侵权纠纷，拓竹科技下架问题内容', 'https://news.sina.com.cn/c/2026-03-16/doc-inhreknt8773257.shtml'],
        ['痛心！逃犯开枪拒捕，37岁民警壮烈牺牲', 'https://news.sina.com.cn/c/2026-03-16/doc-inhreeew9908254.shtml'],
        ['8月1日起，个人贷款息费将一目了然', 'https://news.sina.com.cn/o/2026-03-16/doc-inhrcxwy9828137.shtml'],
        ['清明节放假安排：4月4日至6日放假，共3天', 'https://news.sina.com.cn/c/2026-03-16/doc-inhrcxwx8875105.shtml'],
        ['国家统计局：1—2月份国民经济起步有力、开局良好', 'https://news.sina.com.cn/c/2026-03-16/doc-inhrcxwu6016432.shtml'],
        ['油价即将调整！最新预判', 'https://news.sina.com.cn/c/2026-03-16/doc-inhreknt8792725.shtml'],
        ['全球最大律所掌门人爆雷？警方独家回应', 'https://news.sina.com.cn/c/2026-03-16/doc-inhreees5999676.shtml'],
        ['李彦宏牵头成立的AI生命科学公司，被曝赴港上市', 'https://news.sina.com.cn/c/2026-03-16/doc-inhrekns2753941.shtml'],
      ]},
    ]
  },
  {
    name: '二、国际军事',
    sources: [
      { site: '新浪', items: [
        ['巴基斯坦称对阿富汗军事设施实施打击', 'https://news.sina.com.cn/w/2026-03-17/doc-inhrfwqa9533931.shtml'],
        ['意大利拒绝参与在霍尔木兹海峡的军事行动', 'https://news.sina.com.cn/w/2026-03-17/doc-inhrfwqa9531471.shtml'],
        ['日本青森县近海发生船只相撞事故 3名船员下落不明', 'https://news.sina.com.cn/w/2026-03-17/doc-inhrfwqa9531535.shtml'],
        ['比利时首相：不会参与美国在霍尔木兹海峡的军事行动', 'https://news.sina.com.cn/w/2026-03-17/doc-inhrfshe9653037.shtml'],
        ['以军袭击德黑兰的伊斯兰革命卫队海军总部', 'https://news.sina.com.cn/w/2026-03-17/doc-inhrfsfy5598944.shtml'],
        ['葡萄牙外长：支持通过政治手段促霍尔木兹海峡通航', 'https://news.sina.com.cn/w/2026-03-17/doc-inhrfsfy5598861.shtml'],
        ['美方确认两艘驻海湾扫雷舰已抵达马来西亚', 'https://news.sina.com.cn/w/2026-03-17/doc-inhrfshc8401653.shtml'],
        ['"美国已经输掉了对伊朗的战争"', 'https://news.sina.com.cn/w/2026-03-17/doc-inhrfwpw5504368.shtml'],
        ['伦敦金属交易所铜、铝等主要合约暂停交易', 'https://news.sina.com.cn/w/2026-03-16/doc-inhrezkn9834145.shtml'],
        ['回应身亡传言后 以色列总理再发视频', 'https://news.sina.com.cn/w/2026-03-16/doc-inhrezkh5812113.shtml'],
      ]},
      { site: '观察者网', items: [
        ['伊朗战争：从闪电战到消耗战，暴露了什么？', 'https://www.guancha.cn/WarwickPowell/2026_03_17_810314.shtml'],
        ['波斯古老大地上的灿然古迹，能否躲过美以的战火？', 'https://www.guancha.cn/MengHui/2026_03_16_810234.shtml'],
        ['两场战争中，俄美对这件事的态度形成鲜明对比', 'https://www.guancha.cn/huangjing/2026_03_16_810193.shtml'],
        ['"机器人士兵将参加美国的下一场战争"，但代价呢？', 'https://www.guancha.cn/CharlieCampbell/2026_03_16_810197.shtml'],
        ['在战火中撤侨有多难？中国为什么能做到？', 'https://www.guancha.cn/ZhangZhongZuo/2026_03_16_810187.shtml'],
        ['面对美以轮番空袭，伊朗的导弹发射车是如何生存下来的？', 'https://www.guancha.cn/military-affairs/2026_03_16_810189.shtml'],
        ['一周军评：这是美国人的"苏芬战争"？', 'https://www.guancha.cn/WangShiChun/2026_03_15_810114.shtml'],
        ['战争进入新阶段，美以伊各方"赌注"起了什么变化？', 'https://www.guancha.cn/LiuYanTing/2026_03_15_810096.shtml'],
        ['无论对于美国还是伊朗，这场战争都不能"轻易中止"', 'https://www.guancha.cn/ShenYi/2026_03_14_810003.shtml'],
        ['打了13天，美军暴露出哪些漏洞和缺陷？', 'https://www.guancha.cn/military-affairs/2026_03_12_809726.shtml'],
        ['好战是美国的基因，常败也是，伊朗想输都难', 'https://www.guancha.cn/yanmo/2026_03_11_809621.shtml'],
      ]},
      { site: '钛媒体', items: [
        ['阿联酋宣布临时关闭部分领空', 'https://www.tmtpost.com/nictation/7916520.html'],
        ['白宫官员称特朗普拒绝重启与伊朗谈判', 'https://www.tmtpost.com/nictation/7916505.html'],
        ['特朗普称美国对伊朗的军事行动本周不会结束', 'https://www.tmtpost.com/nictation/7916499.html'],
        ['特朗普暗示袭击哈尔克岛石油设施', 'https://www.tmtpost.com/nictation/7916485.html'],
        ['大量油轮涌向沙特红海港口装运原油，绕开霍尔木兹海峡', 'https://www.tmtpost.com/nictation/7916474.html'],
      ]},
    ]
  },
  {
    name: '三、国际关系/外交',
    sources: [
      { site: '观察者网', items: [
        ['"我们再也不会信任美国"', 'https://www.guancha.cn/Fazli/2026_03_15_810093.shtml'],
        ['欧洲不仅不支持特朗普，甚至希望他输', 'https://www.guancha.cn/SongLuZheng/2026_03_15_810125.shtml'],
        ['外媒问我中国是否给伊朗高超音速导弹？我回了四个字', 'https://www.guancha.cn/ZhangWeiWei/2026_03_14_810005.shtml'],
        ['"中国速度"让在东南亚谋生的华人华侨情感复杂', 'https://www.guancha.cn/luoyifu/2026_03_14_810014.shtml'],
        ['"萨德"走后还需要回来吗？韩国应该想一想', 'https://www.guancha.cn/ChenFeng3/2026_03_14_810015.shtml'],
        ['美国在伊朗打成这副样子，让韩国人很"不安"', 'https://www.guancha.cn/ZhengZaixing/2026_03_13_809873.shtml'],
        ['美伊冲突，让中俄明白当务之急是……', 'https://www.guancha.cn/Ivan/2026_03_12_809708.shtml'],
        ['韩国最担心的不是"萨德"被调走，而是这三个问题', 'https://www.guancha.cn/zhoujiaqi/2026_03_12_809721.shtml'],
        ['一个"以色列优先"的美国不值得盟友信任', 'https://www.guancha.cn/TuZhuXi/2026_03_12_809725.shtml'],
        ['发现花钱买不来保护，海湾六国陷入两难', 'https://www.guancha.cn/ChenFeng3/2026_03_11_809557.shtml'],
      ]},
      { site: '钛媒体', items: [
        ['中美考虑建立促进双边贸易投资合作的工作机制', 'https://www.tmtpost.com/nictation/7916477.html'],
        ['中美在法国巴黎举行经贸磋商', 'https://www.tmtpost.com/nictation/7916475.html'],
        ['德国总理表示不会参与霍尔木兹海峡护航', 'https://www.tmtpost.com/nictation/7916481.html'],
      ]},
    ]
  },
  {
    name: '四、财经/金融',
    sources: [
      { site: '新浪', items: [
        ['首次年度盈利！零跑汽车2025年营收销量双翻倍', 'https://finance.sina.com.cn/jjxw/2026-03-17/doc-inhrfwpz8302590.shtml'],
        ['三部门开展氢能综合应用试点工作', 'https://finance.sina.com.cn/china/gncj/2026-03-17/doc-inhrfwqa9559456.shtml'],
        ['监管部门重拳出击操纵市场行为 年内罚没金额超11亿元', 'https://finance.sina.com.cn/jjxw/2026-03-17/doc-inhrfwqa9547860.shtml'],
        ['同业存款利率自律管理"打补丁" 超10万亿元资金面临调整', 'https://finance.sina.com.cn/roll/2026-03-17/doc-inhrfmyf8479397.shtml'],
        ['上海再降购房门槛 商业用房贷款首付比例降至不低于3成', 'https://finance.sina.com.cn/roll/2026-03-17/doc-inhrfmyh9671278.shtml'],
        ['中文在线盲目追逐热点八年净亏损超40亿', 'https://finance.sina.com.cn/stock/observe/2026-03-16/doc-inhrcxww2841276.shtml'],
        ['银行密集赎回高息优先股，机构资管配置遭遇"平替"困境', 'https://finance.sina.com.cn/money/bank/bank_hydt/2026-03-17/doc-inhrfwpy2297023.shtml'],
        ['理财公司迎评级监管 推动行业发展转向"质量优先"', 'https://finance.sina.com.cn/roll/2026-03-17/doc-inhrfmye2419612.shtml'],
        ['阿里想当AI卖铲人：吴泳铭挂帅ATH事业群', 'https://finance.sina.com.cn/jjxw/2026-03-17/doc-inhrfwqa9591553.shtml'],
        ['一个人就是一个团队 "一人公司"创业新生态正在走来', 'https://finance.sina.com.cn/jjxw/2026-03-17/doc-inhrffse5743014.shtml'],
      ]},
      { site: '钛媒体', items: [
        ['北美餐饮服务商Chowbus获8100万美元融资', 'https://www.tmtpost.com/7916217.html'],
        ['霸王茶姬拟进入韩国市场；爱诗科技完成3亿美元C轮融资', 'https://www.tmtpost.com/7916213.html'],
        ['顶固集创2.68亿跨界豪赌：10倍溢价收购', 'https://www.tmtpost.com/7916151.html'],
        ['高精度激光雷达企业珞珈伊云完成数千万Pre-A轮融资', 'https://www.tmtpost.com/7915615.html'],
        ['比特币站上75000美元', 'https://www.tmtpost.com/nictation/7916525.html'],
        ['日韩股市集体高开，韩国KOSPI指数涨近3%', 'https://www.tmtpost.com/nictation/7916512.html'],
        ['美国SEC正在准备取消季度业绩报告要求的提案', 'https://www.tmtpost.com/nictation/7916496.html'],
        ['SK海力士据悉正研究在美国发行ADR上市的可能性', 'https://www.tmtpost.com/nictation/7916493.html'],
        ['北交所IPO审核提速，一季度上会数量显著增长', 'https://www.tmtpost.com/nictation/7916487.html'],
        ['价值判断：跌停板的投资机会和风险提示', 'https://www.tmtpost.com/7914798.html'],
        ['强制披露基民盈利比，会扒下公募的"底裤"吗？', 'https://www.tmtpost.com/7914460.html'],
        ['央行行长潘功胜：构建科学稳健的货币政策体系', 'https://www.tmtpost.com/7911524.html'],
      ]},
      { site: '观察者网', items: [
        ['新时代的房地产，要的是精耕细作，不是大开大合', 'https://www.guancha.cn/jiangyuzhou/2026_03_16_810232.shtml'],
        ['电子支付深度发展，税收征管如何创新与完善？', 'https://www.guancha.cn/YangSanYi/2026_03_16_810196.shtml'],
        ['坚决把"苹果税"打下来', 'https://www.guancha.cn/Guanxin/2026_03_13_809941.shtml'],
        ['250年历史数据说明：高水平投资才是中国经济的优势', 'https://www.guancha.cn/LuoSiYi/2026_03_13_809877.shtml'],
        ['301关税又要来了', 'https://www.guancha.cn/nanjituzhu/2026_03_13_809866.shtml'],
      ]},
    ]
  },
  {
    name: '五、科技/AI',
    sources: [
      { site: '新浪', items: [
        ['5分钟速览黄仁勋GTC演讲：万亿营收、LPU、太空芯片', 'https://finance.sina.com.cn/stock/bxjj/2026-03-17/doc-inhrfwpy2268832.shtml'],
        ['黄仁勋：龙虾就是新操作系统！英伟达7种芯片拼出算力怪兽', 'https://finance.sina.com.cn/stock/t/2026-03-17/doc-inhrfwpy2263321.shtml'],
        ['警惕AI智能体原生风险：国家安全部发布"龙虾"安全养殖手册', 'https://finance.sina.com.cn/tech/digi/2026-03-17/doc-inhrfwpw5500634.shtml'],
        ['英伟达发布Rubin芯片，算力提升五倍', 'https://finance.sina.com.cn/stock/usstock/c/2026-03-17/doc-inhrfwqa9528557.shtml'],
        ['英伟达推出太空计算服务', 'https://finance.sina.com.cn/stock/usstock/c/2026-03-17/doc-inhrfshe9605560.shtml'],
        ['英伟达预计到2027年底AI芯片收入将达到至少1万亿美元', 'https://finance.sina.com.cn/stock/usstock/c/2026-03-17/doc-inhrfshe9637983.shtml'],
        ['OpenAI将削减副业项目 全力"做好"核心业务', 'https://finance.sina.com.cn/stock/usstock/c/2026-03-17/doc-inhrfwpz8303631.shtml'],
        ['Meta将斥资高达270亿美元采购Nebius算力', 'https://finance.sina.com.cn/stock/usstock/c/2026-03-17/doc-inhrfmye2457412.shtml'],
        ['特斯拉造芯真来了！马斯克官宣Terafab项目7天后启动', 'https://finance.sina.com.cn/tech/discovery/2026-03-16/doc-inhrcpie9911879.shtml'],
        ['腾讯元宝派宣布支持接入OpenClaw', 'https://finance.sina.com.cn/tob/2026-03-16/doc-inhrezkn9807660.shtml'],
        ['三星在英伟达GTC大会首次展示下一代AI芯片HBM4E', 'https://finance.sina.com.cn/stock/usstock/c/2026-03-17/doc-inhrfwpw5501671.shtml'],
        ['华虹7nm量产倒计时', 'https://finance.sina.com.cn/tech/discovery/2026-03-16/doc-inhreknu9832280.shtml'],
        ['全球首款侵入式脑机接口医疗器械获批上市', 'https://news.sina.com.cn/zx/gj/2026-03-16/doc-inhrevaq9836029.shtml'],
      ]},
      { site: '钛媒体', items: [
        ['黄仁勋，不愧为"Token之王"！（附GTC 2026演讲全文）', 'https://www.tmtpost.com/7916519.html'],
        ['英伟达GTC 2026：黄仁勋预判万亿营收，一键"养虾"卡位底层基建', 'https://www.tmtpost.com/7916531.html'],
        ['英伟达GTC 2026前瞻！200亿美元"窃壳"Groq', 'https://www.tmtpost.com/7916354.html'],
        ['当AI进入真实世界：Hitch Open在F1赛道开启物理智能时代', 'https://www.tmtpost.com/7916266.html'],
        ['对话腾讯"龙虾特攻队"：能检测出谁给龙虾投毒', 'https://www.tmtpost.com/7915924.html'],
        ['手术机器人陷行业内卷与定价失衡', 'https://www.tmtpost.com/7916081.html'],
        ['阿里成立Token Hub事业群，由CEO吴泳铭直接负责', 'https://www.tmtpost.com/7916118.html'],
        ['OpenClaw引发权威机构连续预警；腾讯云涨价部分AI模型涨幅超400%', 'https://www.tmtpost.com/7914449.html'],
        ['AI将省出5300亿、淘汰一半人，腾爱优芒红果提出什么新需求？', 'https://www.tmtpost.com/7914747.html'],
        ['万物皆可"养龙虾"，20万人围观AI家电大混战｜AWE 2026', 'https://www.tmtpost.com/7913257.html'],
        ['工信部：适度超前布局建设5G、智算等新型信息基础设施', 'https://www.tmtpost.com/7916294.html'],
        ['Figure机器人深夜炸场！', 'https://www.tmtpost.com/video/7915767.html'],
      ]},
      { site: '观察者网', items: [
        ['要阻止他国用AI作恶，我们需主动完成一项工作', 'https://www.guancha.cn/jiangqiping/2026_03_11_809622.shtml'],
        ['AI正成为现代世界基础设施，能源是最底层约束', 'https://www.guancha.cn/JensenHuang/2026_03_11_809631.shtml'],
      ]},
    ]
  },
  {
    name: '六、社会民生',
    sources: [
      { site: '新浪', items: [
        ['央视3·15七弹连发！直击漂白鸡爪、荐股骗局、AI投毒', 'https://finance.sina.com.cn/zt_d/subject-1772422520'],
        ['胖东来169元1克拉方糖戒指再上架，每人限购5枚', 'https://news.sina.com.cn/s/2026-03-16/doc-inhrezkm8685357.shtml'],
        ['姚晨官宣离婚！两人仍有商业关联', 'https://news.sina.com.cn/s/2026-03-16/doc-inhrequs9866229.shtml'],
        ['卧底卧成二把手的记者315又立功', 'https://news.sina.com.cn/s/2026-03-16/doc-inhrcxwx8856428.shtml'],
        ['"童年味道"土锅巴，食品原料和臭鞋垫一起烤', 'https://news.sina.com.cn/s/2026-03-15/doc-inhrafpv0048496.shtml'],
        ['网红"刘文祥"被查！', 'https://news.sina.com.cn/s/2026-03-15/doc-inhqzzfu3501899.shtml'],
        ['45岁保安跨省追查卖家，牵出老头乐隐秘灰色产业链', 'https://news.sina.com.cn/o/2026-03-14/doc-inhqyhwn7355279.shtml'],
        ['短剧十字路口：AI来了，他们还在拍真人', 'https://news.sina.com.cn/s/2026-03-14/doc-inhqxfks0579930.shtml'],
        ['网红"王炸姐"直播时突发疾病离世，年仅39岁', 'https://news.sina.com.cn/s/2026-03-12/doc-inhqtcuq1881241.shtml'],
        ['当全民"养虾"狂欢，金融玩家为何集体"克制"', 'https://news.sina.com.cn/s/2026-03-10/doc-inhqphnp6193260.shtml'],
      ]},
      { site: '观察者网', items: [
        ['换了医院就得重新检查，"医检互认"还有多少路要走？', 'https://www.guancha.cn/politics/2026_03_12_809766.shtml'],
        ['城管执法"文明"后，新的问题出来了', 'https://www.guancha.cn/weichengling/2026_03_12_809722.shtml'],
        ['"AI霸总"围猎老年人，如何帮他们远离陷阱？', 'https://www.guancha.cn/politics/2026_03_11_809632.shtml'],
        ['盲目跟风西方社媒禁令，是自断中国孩子在数字时代的后路', 'https://www.guancha.cn/lixiaojing/2026_03_13_809867.shtml'],
      ]},
    ]
  },
  {
    name: '七、体育/NBA',
    sources: [
      { site: '新浪', items: [
        ['詹姆斯自拍展示右腿上的伤口', 'https://sports.sina.com.cn/basketball/nba/2026-03-17/doc-inhrfwpz8297808.shtml'],
        ['战力榜：雷霆反超马刺重返联盟第一，湖人暴涨至第6', 'https://sports.sina.com.cn/basketball/nba/2026-03-17/doc-inhrfwqa9564882.shtml'],
        ['威少晒近照配文座右铭：WHY NOT?', 'https://sports.sina.com.cn/basketball/nba/2026-03-17/doc-inhrfwqa9564918.shtml'],
        ['杜兰特：迈阿密时期的詹姆斯最难防', 'https://sports.sina.com.cn/basketball/nba/2026-03-17/doc-inhrfwpz8296565.shtml'],
        ['巴特勒：我喜欢库明加最近的表现', 'https://sports.sina.com.cn/basketball/nba/2026-03-17/doc-inhrfwpz8296151.shtml'],
        ['库里赛季末复出？医疗组非常谨慎', 'https://sports.sina.com.cn/basketball/nba/2026-03-17/doc-inhrfwpz8297295.shtml'],
        ['SGA连续128场20+，114次前三节拿到', 'https://sports.sina.com.cn/basketball/nba/2026-03-17/doc-inhrfwpz8298358.shtml'],
        ['文班亚马想同时夺MVP和DPOY', 'https://sports.sina.com.cn/basketball/nba/2026-03-17/doc-inhrfwpy2281490.shtml'],
        ['骑士官方：阿伦将缺席三连客比赛', 'https://sports.sina.com.cn/basketball/nba/2026-03-17/doc-inhrfwpw5503562.shtml'],
        ['富保罗：这辈子没见过没詹会更好的队', 'https://sports.sina.com.cn/basketball/nba/2026-03-17/doc-inhrfwpz8297894.shtml'],
        ['本赛季净效率排行：文班+15.6力压SGA居首', 'https://sports.sina.com.cn/basketball/nba/2026-03-17/doc-inhrfwpy2280934.shtml'],
        ['苏翊鸣人民日报撰文：成长，是永不言败', 'https://news.sina.com.cn/c/2026-03-17/doc-inhrfwqa9545168.shtml'],
        ['2026短道世锦赛落下帷幕，中国队1银1铜收官', 'https://news.sina.com.cn/c/2026-03-16/doc-inhrcxwu6006367.shtml'],
      ]},
    ]
  },
  {
    name: '八、汽车/出行',
    sources: [
      { site: '新浪', items: [
        ['方程豹钛3闪充版上市 售15.38-16.98万元', 'https://auto.sina.com.cn/newcar/2026-03-14/detail-inhqxmsr7269243.shtml'],
        ['抢先试驾零跑A10 10万级SUV也能配激光雷达', 'https://auto.sina.com.cn/news/2026-03-16/detail-inhrezkh5815617.shtml'],
        ['大众与小鹏合作首款车型与众08量产下线', 'https://auto.sina.com.cn/newcar/2026-03-13/detail-inhqvnzp7840549.shtml'],
        ['极氪8X开启预售 售价37.68万至51.68万元', 'https://auto.sina.com.cn/newcar/2026-03-16/detail-inhrezkh5809049.shtml'],
        ['置换补贴价8.68万元 五菱缤果S 525Km旗舰款上市', 'https://auto.sina.com.cn/newcar/2026-03-14/detail-inhqxryr3440861.shtml'],
        ['代步神车再进化 试驾第五代宏光MINIEV', 'https://auto.sina.com.cn/review/2026-03-16/detail-inhreeev8885036.shtml'],
        ['全新腾势D9插混版公告图 或配闪充技术', 'https://auto.sina.com.cn/newcar/2026-03-14/detail-inhqyaqq7396734.shtml'],
        ['F1中国站凯迪拉克双车顺利完赛', 'https://auto.sina.com.cn/news/2026-03-16/detail-inhreknt8791253.shtml'],
      ]},
      { site: '钛媒体', items: [
        ['当电动车开始"马力通胀"，谁还在认真讨论高性能？', 'https://www.tmtpost.com/7916184.html'],
        ['营收破千亿，净利却缩水85%，理想汽车进入"最危险的一年"', 'https://www.tmtpost.com/7912445.html'],
        ['理想汽车的变革方向，被严重误解了', 'https://www.tmtpost.com/7913944.html'],
        ['从地面到苍穹，追觅全宇宙加速"芯际穿越"', 'https://www.tmtpost.com/7914085.html'],
      ]},
    ]
  },
  {
    name: '九、消费/产业',
    sources: [
      { site: '钛媒体', items: [
        ['3·15酒水观察：虚假宣传成重灾区', 'https://www.tmtpost.com/7914681.html'],
        ['"拥有时代"到"体验时代" 2026消费变局', 'https://www.tmtpost.com/video/7915885.html'],
        ['一盒鸡蛋刷走8万 警惕新型骗局！', 'https://www.tmtpost.com/video/7915116.html'],
        ['广东：到2030年力争培育形成万亿元级赛道3个以上', 'https://www.tmtpost.com/7907543.html'],
      ]},
    ]
  },
  {
    name: '十、文化评论',
    sources: [
      { site: '观察者网', items: [
        ['讲"革命在美国失败"的电影，横扫奥斯卡', 'https://www.guancha.cn/xinchaoguanyu/2026_03_16_810240.shtml'],
        ['"《太平年》的人民史观，就是让历史人物好好上班"', 'https://www.guancha.cn/dongzhe/2026_03_11_809628.shtml'],
      ]},
    ]
  },
];

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('Getting access token...');
  const token = await getAccessToken();
  console.log('Token OK');

  console.log('Creating document...');
  const docId = await createDoc(token, '国内新闻爬取汇总 - 2026-03-17 | 大虾出品');
  if (!docId) { process.exit(1); }
  console.log('Doc ID:', docId);

  // Intro
  await batchInsert(token, docId, [
    text('数据来源：新浪新闻、观察者网、钛媒体 | 按栏目分类整理 | 共10个栏目 | 爬取时间：2026-03-17'),
    text(''),
  ]);

  for (const cat of categories) {
    console.log(`\n>> ${cat.name}`);
    
    // Category heading
    await batchInsert(token, docId, [heading1(cat.name)]);
    await sleep(200);

    for (const src of cat.sources) {
      // Source sub-heading
      await batchInsert(token, docId, [heading2(`【${src.site}】`)]);
      await sleep(200);

      // Items
      const bullets = src.items.map(([title, url], i) => 
        bullet(`${i + 1}. ${title} — ${url}`)
      );

      // Batch in groups of 5 to avoid API limits
      for (let i = 0; i < bullets.length; i += 5) {
        const batch = bullets.slice(i, i + 5);
        await batchInsert(token, docId, batch);
        await sleep(300);
      }
    }
    
    // Divider between categories
    await batchInsert(token, docId, [divider(), text('')]);
    await sleep(200);
  }

  console.log(`\n✅ Done! https://szzhgl.feishu.cn/docx/${docId}`);
}

main().catch(e => console.error(e));
