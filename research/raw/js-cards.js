var imageBaseUrl = 'https://game.gtimg.cn/images/osgame/cp/a20260707sfgw/card';

function isMobileDevice() {
    var ua = navigator.userAgent;
    var isIOS = /iPhone|iPad|iPod/i.test(ua) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var isAndroid = /Android/i.test(ua);
    var isMiloMobile = window.Milo &&
        typeof Milo.isMobile === 'function' &&
        Milo.isMobile();

    return Boolean(isMiloMobile || isIOS || isAndroid);
}

var isMobile = isMobileDevice();
const imageObj = new Image();

function formatSkillRichText(desc) {
    return String(desc || '')
        .replace(/<color\s*=\s*([^>]+)>/gi, '<span style="color:$1">')
        .replace(/<\/color\s*>/gi, '</span>')
        .replace(/\n/g, '<br />');
}
// 切换大类
$('.card-tab a').click(function(){
    var i = $(this).index();
    $(this).addClass('on').siblings().removeClass('on');
    $('.cards-box .cards-detail').eq(i).addClass('on').siblings().removeClass('on');
    if(i==2){
        // 装备轮播
        var swiper3 = new Swiper('#cards-right2', {
            grabCursor: true,
            effect: "creative",
            creativeEffect: {
                prev: {
                    translate: ["-10%", 0, -150],
                },
                next: {
                    translate: ["-15%", 0, -150],
                },
            },
            simulateTouch : false,//禁止鼠标模拟
            loop:true,
            observer:true, // 修改swiper自己或子元素时，自动初始化swiper
            observeParents:true, // 修改swiper的父元素时，自动初始化swiper
            pagination: {
                el: ".swiper-pagination2",
                // clickable: true,
            },
            on: {
                init(){
                    $('#cards-right2').click(function(){
                        swiper3.slideNext(1000);
                    })
                    $('.swiper-desc-con').eq(0).fadeIn().siblings().fadeOut();
                },
                slideChangeTransitionStart: function(){
                    var num = this.realIndex;
                    $('.swiper-desc-con').eq(num).show().siblings().hide();
                    console.log(num);
                },
            },
        });
    }
    if(i==3){
        // 装备轮播
        var swiper4 = new Swiper('#cards-right3', {
            grabCursor: true,
            effect: "creative",
            creativeEffect: {
                prev: {
                    translate: ["-10%", 0, -150],
                },
                next: {
                    translate: ["-15%", 0, -150],
                },
            },
            simulateTouch : false,//禁止鼠标模拟
            loop:true,
            observer:true, // 修改swiper自己或子元素时，自动初始化swiper
            observeParents:true, // 修改swiper的父元素时，自动初始化swiper
            pagination: {
                el: ".swiper-pagination3",
                // clickable: true,
            },
            on: {
                init(){
                    $('#cards-right3').click(function(){
                        swiper4.slideNext(1000);
                    })
                },
            },
        });
    }

    afterFilterTop();
});

$('.cards-r-tab a').click(function(){
    var i = $(this).index();
    const descMap = [{
    name: '说明',
    short: 'shuoming',
    },{
    name: '技能',
    short: 'jineng',
    },{
    name: '属性',
    short: 'shuxing',
    },{
    name: '觉醒',
    short: 'juexing',
    }];

    comm.reportEvent('btn', 'kptj_' + chooseCardInfo.navShort + '_' + chooseCardInfo.name + '_' + descMap[i].short, '卡牌图鉴' + chooseCardInfo.navName + descMap[i].name);
    $(this).addClass('on').siblings().removeClass('on');
    $('.cards-r-item').eq(i).addClass('on').siblings().removeClass('on');
    if(i==3){
        // 英雄觉醒轮播
        var swiper2 = new Swiper('#cards-right', {
            grabCursor: true,
            effect: "creative",
            creativeEffect: {
                prev: {
                    translate: ["-10%", 0, -150],
                },
                next: {
                    translate: ["-15%", 0, -150],
                },
            },
            simulateTouch : false,//禁止鼠标模拟
            loop:true,
            observer:true, // 修改swiper自己或子元素时，自动初始化swiper
            observeParents:true, // 修改swiper的父元素时，自动初始化swiper
            pagination: {
                el: ".swiper-pagination1",
                // clickable: true,
            },
            on: {
                init(){
                    $('#cards-right').click(function(){
                        swiper2.slideNext(1000);
                    })
                }
            },
        });
    }
});
// 切换大类后
function afterFilterTop() {
    if ($searchInput.val()) {
        // 清空搜索框
        clearSearchInput();
    }
    let $cardBox = getCardBox();
    /*if ($cardBox.find('.cards-l-item2 a').eq(0).hasClass('on')) {
        // 如果此时是选中第一个【全部】，则显示全部，防止为空
        renderList();
    }*/
    // 触发第一个【全部】
    $cardBox.find('.cards-l-item2 a').eq(0).click();

    if (isMobile) {
        $('.cards-l-item2').removeClass('act');
    }
}

// 分类筛选项
$(document).on('click', '.cards-l-item2 a', function(){
    // $(this).addClass('on').siblings().removeClass('on');
    // 全部子选项只能选一个
    $(this).parents('.cards-l-top').find('a').removeClass('on');
    $(this).addClass('on');

    // 列表页滚动至顶部
    $('.cards-l-list').animate({ scrollTop: 0 }, 100);

    // 清空搜索框
    clearSearchInput();
    // 筛选列表结果
    let cateId = $(this).data('id') !== undefined ? $(this).data('id') : 999999;
    const cardItemData = $(this).parents('.cards-l-item').data();
    let cateRowId = cardItemData.id;
    let cateShort = cardItemData.short;
    let cateName = cardItemData.name;
    let filterShort = $(this).data('short');
    let filterName = $(this).data('name');
    let nav = $(this).parents('.cards-detail').data('id');
    let navShort = ''
    let navName = ''
    switch (parseInt(nav)) {
        case 1:
            navShort = 'yxp';
            navName = '英雄牌';
            break;
        case 2:
            navShort = 'tfp';
            navName = '天赋牌';
            break;
        case 3:
            navShort = 'zbp';
            navName = '装备牌';
            break;
        case 4:
            navShort = 'xgp';
            navName = '效果牌';
            break;
        default:
            break;
    }

    if (navShort) {
        comm.reportEvent('btn', 'kptj_' + navShort + '_'+ cateShort + '_' + filterShort, '卡牌图鉴' + navName + cateName + '筛选')
    }

    renderList(cateId, cateRowId);
});

// 卡牌类型配置  key为接口返回的类型
var cardTypeMap = {
    1: {nav: 1, name: '英雄牌', shape_class: 'desc-img2'}, // 长方形
    2: {nav: 4, name: '效果牌', shape_class: 'desc-img3'}, // 正方形
    5: {nav: 3, name: '装备牌', shape_class: 'desc-img'}, // 圆形
    6: {nav: 2, name: '天赋牌', shape_class: 'desc-img'}, // 圆形
};

// 分类配置
var categoryMap = {
    1: { // 英雄牌
        1: {
            name: '阵营',
            name2: '阵&nbsp;&nbsp;&nbsp;&nbsp;营',
            short: 'zhenying',
            list: [
                {id: 321, name: '大河流域', short: 'dahe', image: imageBaseUrl+'/icon/Icon_DaHeLiuYu.png'},
                {id: 320, name: '逐鹿', short: 'zhulu', image: imageBaseUrl+'/icon/Icon_ZhuLu.png'},
                {id: 309, name: '三分之地', short: 'sanfen', image: imageBaseUrl+'/icon/Icon_SanFenZhiDi.png'},
                {id: 319, name: '河洛', short: 'heluo', image: imageBaseUrl+'/icon/Icon_HeLuo.png'},
                {id: 314, name: '日落海', short: 'riluohai', image: imageBaseUrl+'/icon/Icon_RiLuoHai.png'},
                {id: 307, name: '无阵营', short: 'wuzhenying', image: imageBaseUrl+'/icon/wuzhenyin.png'},
            ]
        },
        2: {
            name: '关键词',
            style: 'height: 1.24rem;',
            short: 'guanjianci',
            list: [
                {id: 5, name: '败阵', short: 'baizhen', image: imageBaseUrl+'/icon/baizhen.png', mark: '英雄上阵期间若战斗失败，触发效果。'},
                {id: 1, name: '登场', short: 'dengchang', image: imageBaseUrl+'/icon/dengchang.png', mark: '使用此卡牌后，触发效果。'},
                {id: 16, name: '复生', short: 'fusheng', image: imageBaseUrl+'/icon/fusheng.png', mark: '英雄在阵亡后会复活，并恢复50%生命值。'},
                {id: 13, name: '合成', short: 'hecheng', image: imageBaseUrl+'/icon/hecheng.png', mark: '英雄上阵期间若战斗胜利，触发效果。'},
                {id: 3, name: '开团', short: 'kaituan', image: imageBaseUrl+'/icon/jiaofeng.png', mark: '战斗开始时，触发效果。'},
                {id: 4, name: '凯旋', short: 'kaixuan', image: imageBaseUrl+'/icon/kaixuan.png', mark: '英雄上阵期间若战斗胜利，触发效果。'},
                {id: 100, name: '闪现', short: 'shanxian', image: imageBaseUrl+'/icon/shanxian.png', mark: '战斗开始时，英雄会跳跃至敌方战场的镜像位置。'},
                {id: 200, name: '夺取', short: 'duoqu', image: imageBaseUrl+'/icon/sheling.png', mark: '使用此卡牌时，夺取周围1格随机1名己方英雄的等级(最多10级，不包含临时等级)。'},
                {id: 321, name: '图腾', short: 'tuteng', image: imageBaseUrl+'/icon/tuteng.png', mark: '大河流域阵营专属单位，存活时提供特殊效果。'},
                {id: 10, name: '牺牲', short: 'xisheng', image: imageBaseUrl+'/icon/xisheng.png', mark: '英雄阵亡时，触发效果。'},
                {id: 11, name: '整备', short: 'zhengbei', image: imageBaseUrl+'/icon/zhengbei.png', mark: '回合开始时，触发效果。'},
                {id: 9, name: '退场', short: 'tuichang', image: imageBaseUrl+'/icon/tuichang.png', mark: '场上的此英雄被出售时，触发效果。'},
            ]
        },
        3: {
            name: '品阶',
            name2: '品&nbsp;&nbsp;&nbsp;&nbsp;阶',
            short: 'pinjie',
            list: [
                {id: 1, name: '1阶', short: '1jie'},
                {id: 2, name: '2阶', short: '2jie'},
                {id: 3, name: '3阶', short: '3jie'},
                {id: 4, name: '4阶', short: '4jie'},
                {id: 5, name: '5阶', short: '5jie'},
            ]
        },
    },
    2: { // 天赋牌
        1: {
            name: '品阶',
            name2: '品&nbsp;&nbsp;&nbsp;&nbsp;阶',
            short: 'pinjie',
            list: [
                {id: 1, name: '1阶', short: '1jie'},
                {id: 2, name: '2阶', short: '2jie'},
                {id: 3, name: '3阶', short: '3jie'},

                /*{id: 1, name: '初始阵容'},
                {id: 2, name: '第一轮拍卖'},
                {id: 3, name: '第二轮拍卖'},
                {id: 4, name: '第三轮拍卖'},
                {id: 5, name: '第四轮拍卖'},
                {id: 5, name: '第五轮拍卖'},
                {id: 5, name: '第六轮拍卖'},
                {id: 5, name: '第七轮拍卖'},
                {id: 5, name: '第八轮拍卖'},*/
            ]
        },
        2: {
            name: '解锁',
            name2: '解&nbsp;&nbsp;&nbsp;&nbsp;锁',
            short: 'jiesuo',
            list: [
                {id: 1, name: '初始天赋', mark: '初始解锁', short: 'cstf'},
                {id: 2, name: '天赋包一', mark: '万象大赛达到倔强青铜Ⅳ解锁', short: 'tbf1'},
                {id: 3, name: '天赋包二', mark: '万象大赛达到倔强青铜Ⅱ解锁', short: 'tbf2'},
                {id: 4, name: '天赋包三', mark: '万象大赛达到秩序白银Ⅴ解锁', short: 'tbf3'},
            ]
        },
    },
    3: { // 装备牌
        1: {
            name: '相关',
            name2: '相&nbsp;&nbsp;&nbsp;&nbsp;关',
            short: 'xiangguan',
            list: [
                {id: 16, name: '基础装备', mark: '使用以合成普通装备', short: 'jichu'},
                {id: 4, name: '普通装备', mark: '由基础装备合成的通用装备', short: 'putong'},
                {id: 5, name: '特殊装备', mark: '达成特定条件产出的强力装备', short: 'teshu'},
                {id: 15, name: '天赋装备', mark: '棋手升级概率可选择的装备', short: 'tianfu'},
            ]
        },
        2: {
            name: '类型',
            name2: '类&nbsp;&nbsp;&nbsp;&nbsp;型',
            short: 'leixing',
            list: [
                {id: 7, name: '防御装备', short: 'fangyu'},
                {id: 2, name: '法术装备', short: 'fashu'},
                {id: 3, name: '通用装备', short: 'tongyong'},
                {id: 1, name: '物理装备', short: 'wuli'},
            ]
        },
    },
    4: { // 效果牌
        1: {
            name: '品阶',
            name2: '品&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;阶',
            short: 'pinjie',
            list: [
                {id: 1, name: '1阶', short: '1jie'},
                {id: 2, name: '2阶', short: '2jie'},
                {id: 3, name: '3阶', short: '3jie'},
                {id: 4, name: '4阶', short: '4jie'},
                {id: 5, name: '5阶', short: '5jie'},
                {id: 6, name: '6阶', short: '6jie'},
            ]
        },
        2: {
            name: '卡牌类型',
            short: 'kapaileixing',
            list: [
                {id: 0, name: '通用', short: 'tongyong'},
                {id: 321, name: '大河流域', short: 'dahe'},
                {id: 319, name: '河洛', short: 'heluo'},
                {id: 314, name: '日落海', short: 'riluohai'},
                {id: 309, name: '三分之地', short: 'sanfen'},
                {id: 307, name: '无阵营', short: 'wuzhenying'},
                {id: 320, name: '逐鹿', short: 'zhulu'},
            ]
        },
        3: {
            name: '解锁',
            name2: '解&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;锁',
            short: 'jiesuo',
            list: [
                {id: 1, name: '初始效果卡', mark: '初始解锁', short: 'csxgk'}, // 初始效果牌
                {id: 2, name: '效果卡包一', mark: '万象大赛达到倔强青铜Ⅳ解锁', short: 'xgkb1'}, // 效果牌包一
                {id: 3, name: '效果卡包二', mark: '万象大赛达到秩序白银Ⅴ解锁', short: 'xgkb2'}, // 效果牌包二
                {id: 4, name: '效果卡包三', mark: '', short: 'xgkb3'}, // 效果牌包三
                {id: 5, name: '效果卡包四', mark: '', short: 'xgkb4'}, // 效果牌包四
            ]
        },
    }
};

// 渲染分类筛选项
$.each(categoryMap, function (nav, val) {
    let index = 0;
    let html = '';

    $.each(val, function (catId, cat) {
        index ++;
        html +=
            '<div class="cards-l-item" data-name="'+ cat.name +'" data-short="'+ cat.short +'" data-id="'+ catId +'" style="'+ (cat.style && !isMobile ? cat.style : '') +'">' +
            '   <p>'+ (cat.name2 && !isMobile ? cat.name2 : cat.name) +'</p>' +
            '   <div class="cards-l-item2">';

        html += '<a href="javascript:;" data-id="all" data-short="all" class="'+ (index === 1 ? 'on' : '') +'">全部</a>';

        $.each(cat.list, function (key, item) {
            html += '<a href="javascript:;" data-name="'+ item.name +'" data-id="'+ item.id +'" data-short="' + (item.short || '') + '">'+ item.name +'</a>';
        });

        html += '</div>';
        html += '</div>';
    });

    if (isMobile) {
        html +=
            '<div class="cards-search">' +
            '   <input type="text" placeholder="搜索卡牌">' +
            '   <a href="javascript:;"></a>' +
            '</div>';
    }

    $('.cards-detail').eq(nav-1).data('id', nav);
    $('.cards-detail').eq(nav-1).find('.cards-l-top').html(html);
});

// 所有卡牌列表
var allCardList = {};
// 请求接口
/*Milo.emit({
    actId: '30_KbMClE',
    token: 'AKD5Kz',
    sData: {
        roleID: 0, // 角色ID 不传则不会返回拥有状态、熟练度等
        bookType: 0, // 0:all 1:英雄牌 2:效果牌 4:装备牌 8:天赋牌 16:棋手
    },
    success: function(res){
        console.log('cards success', res);
        let data = res.details.jData.cardInfo.data;
    },
    fail: function(res){
        console.log('cards fail', res);
        comm.ajaxFail(res);
    }
});*/

// 获取本地文件
/*$.getJSON('api/oscard.json')
    .done(function(res) {
        let data = res.jData.cardInfo.data;
        allCardList = {
            1: data.heroCards,   // 英雄牌
            2: data.talentCards, // 天赋牌
            3: data.equipCards,  // 装备牌
            4: data.effectCards, // 效果牌
        };
        renderList();
    })
    .fail(function() {
        console.error('数据加载失败');
    });*/

// 分批请求
var apiUrls = [
    'https://game.gtimg.cn/images/amside/ide_timer/589094_oscard_new_1.js', // 英雄牌
    'https://game.gtimg.cn/images/amside/ide_timer/589094_oscard_new_8.js', // 天赋牌
    'https://game.gtimg.cn/images/amside/ide_timer/589094_oscard_new_4.js', // 装备牌
    'https://game.gtimg.cn/images/amside/ide_timer/589094_oscard_new_2.js'  // 效果牌
];
// 1. 生成所有的请求 Promise 对象
var apiRequests = $.map(apiUrls, function(url, key) {
    return $.getJSON(url);
});
// 2. 等待所有请求完成
$.when.apply($, apiRequests).done(function() {
    // var allData = [];
    // 3. 遍历所有结果并提取 data
    $.each(arguments, function(index, responseArray) {
        // arguments 是一个类数组对象，包含每个请求的返回结果
        var data = responseArray[0]; // 取出实际的数据部分
        if (data) {
            let filterData = []
            let cardData = [
                data.heroCards,
                data.talentCards,
                data.equipCards,
                data.effectCards,
            ][index];

            // cardImage 为空不显示 previewCards的cardimage有空数据也隐藏
            cardData.map(item => {
                if (item.cardImage == '' || (item.previewCards.length > 0 && item.previewCards.some(preview => preview.cardImage == ''))) {
                    return
                }
                filterData.push(item);
            })
            allCardList[index+1] = filterData;
        }
    });
    console.log('allCardList', allCardList);

    // 初始化渲染列表
    // 只在有列表页时才渲染，详情页走 showCurCardInfo_M 自己的渲染逻辑
    if ($('.cards-detail').length > 0) {
        renderList();
    }

}).fail(function() {
    console.error('其中一个或多个请求失败了');
});

// 打开技能演示视频
function showSkillVideo(cardId, url) {
    comm.reportEvent('btn', 'kptj_' + chooseCardInfo.navShort + '_' + chooseCardInfo.name + '_jnys', '卡牌图鉴英雄牌技能演示视频');

    function openVideo(videoUrl) {
        if (!videoUrl || typeof window.showOverlay2 !== 'function') {
            console.error('技能视频地址或弹窗方法不存在');
            return;
        }
        // 移到 body 下，避免移动端滚动容器影响 fixed 弹窗的视口定位
        $('#video-dia').appendTo(document.body);
        window.showOverlay2(videoUrl);
    }

    // 优先使用当前卡牌已经拿到的视频地址，保证点击后立即显示弹窗
    if (url) {
        openVideo(url);
        return;
    }

    // 没有视频地址时重新请求卡牌数据，并按统一数值类型匹配卡牌 ID
    $.getJSON(apiUrls[0])
        .done(function(data) {
            var matchedCard = null;
            $.each(data.heroCards || [], function(key, row) {
                if (Number(row.id) === Number(cardId)) {
                    matchedCard = row;
                    return false;
                }
            });
            var skillInfo = matchedCard && matchedCard.heroCard && matchedCard.heroCard.skillList && matchedCard.heroCard.skillList[0];
            openVideo(skillInfo && skillInfo.url);
        })
        .fail(function() {
            console.error('数据加载失败：英雄牌');
        });
}

/**
 * 获取当前导航索引 1~4
 */
function getCurNav() {
    var nav = $('.card-tab a.on').data('id');
    if (nav === undefined || nav === null) {
        nav = chooseCardInfo.navId;
    }
    return nav;
}
/**
 * 获取每个导航下的容器
 * @param nav 导航索引
 */
function getCardBox(nav) {
    nav = nav ? nav : getCurNav();
    return $('.cards-detail').eq(nav-1);
}

/**
 * 获取每个导航下的列表容器
 * @param nav 导航索引
 */
function getCardListBox(nav) {
    nav = nav ? nav : getCurNav();
    return getCardBox(nav).find('.cards-l-list');
}

/**
 * 获取该导航下的卡牌列表数据
 * @param nav
 * @returns {*}
 */
function getCardList(nav) {
    nav = nav ? nav : getCurNav();
    return allCardList[nav];
}

/**
 * 获取卡牌图片 html
 * @param row
 * @param nav
 * @returns {string}
 */
function getCardImageHtml(row, nav = null) {
    nav = nav ? nav : (cardTypeMap[row.type] ? cardTypeMap[row.type].nav : getCurNav());
    let html = '';
    // 品阶
    html += ((nav === 1 || nav === 4) && row.levelIcon ? '<img class="li-icon" src="https://game.gtimg.cn/images/osgame/cp/a20260707sfgw/qualityIcon/' + row.quality + '.png" alt="">' : '');
    // new标识，不做了
    // html += (row.is_new ? '<i class="li-new"></i>' : '');
    // todo 英雄牌暂时使用本地的，后续等营地出字段替换
    // let image = nav === 3 ? row.image : (nav === 1 ? imageBaseUrl + '/icon/hero_' + row.id + '.png' : row.thumb);
    let image = nav === 1 ? imageBaseUrl + '/icon/hero_' + row.id + '.png' : (row.thumb || row.image);
    // 天赋牌增加背景图（通过class）
    html += '<img class="li-hero' + (nav === 2 ? ' tf_bg' + row.quality : '') + '" src="' + image + '" alt="" ' +
        'onerror="this.src=\'' + imageBaseUrl + '/cards-default.png' + '\'; this.onerror=null;" >';
    return html;
}

function applyCardImageFallback($container) {
    $container.find('img').each(function () {
        var img = this;
        img.onerror = function () {
            img.onerror = null;
            img.src = imageBaseUrl + '/card_img_default.png';
        };
    });
}

/**
 * 获取列表卡牌 html（单个）
 * @param row
 * @returns {string}
 */
function getListItemHtml(row) {
    let nav = getCurNav();
    return '<div class="li-detail" data-name="' + row.name + '" data-id="' + row.id + '">' +
        getCardImageHtml(row, nav) +
        '   <p>' + row.name + '</p>' +
        '</div>';
}

var cateImageList = [];
/**
 * 获取列表分类标题 html（单个）
 * @param cate
 * @param cateRowId
 * @returns {string}
 */
function getListCateTitleHtml(cate = null, cateRowId = 0) {
    if (cate && cate.image && $.inArray(cate.image, cateImageList) < 0) {
        cateImageList.push(cate.image);
    }
    return '<div class="cards-l-li" data-id="' + (cate ? cate.id : 0) + '" data-row="' + cateRowId + '">' +
        (cate ?
        '   <div class="li-ti">' +
                (cate.image ? '<img src="' + cate.image + '" alt="">' : '') +
                '<p>' + cate.name + '</p>' +
                // (cate.mark ? '<span>' + cate.mark + '</span>' : '') +
        '   </div>'
        : '') +
        '   <div class="li-cards">' +
        '   </div>' +
        '</div>';
}

/**
 * 渲染卡牌列表
 * @param cateId 筛选分类，默认全部
 * @param cateRowId 筛选分类行，区分开每一行分类，默认第一行
 */
function renderList(cateId = 'all', cateRowId = 1) {
    // 导航索引
    let nav = getCurNav();

    // 先渲染全部分类标题
    let cateHtml = '';
    $.each(categoryMap[nav][cateRowId].list, function (key, row) {
        if (cateId === 'all' || cateId === row.id) {
            cateHtml += getListCateTitleHtml(row, cateRowId);
        }
    });
    let $cardList = getCardListBox(nav);
    // $cardList.html(cateHtml);
    /* 防止图片加载延迟或闪烁 */
    var totalImages = cateImageList.length;
    if (totalImages === 0) {
        afterLoad();
    } else {
        var loadedCount = 0;
        var results = []; // 用来存每张图片的最终状态
        for (var i = 0; i < totalImages; i++) {
            var src = cateImageList[i];

            // 创建图片对象 (变量名不要用 Image)
            var imgObj = new Image();

            // 定义一个通用的完成回调函数
            // 无论是成功还是失败，都算“处理完成”
            var onImageDone = function (finalSrc, status) {
                // 1. 保存结果
                results.push({
                    src: finalSrc,
                    status: status
                });

                // 2. 计数器 +1
                loadedCount++;

                // 3. 检查是否所有图片都处理完了
                if (loadedCount === totalImages) {
                    console.log('total image done');
                    afterLoad();
                }
            };

            // 绑定加载成功事件
            imgObj.onload = function () {
                // 注意：这里的 this 指向当前的 imgObj
                onImageDone(this.src, 'loaded');
            };

            // 绑定加载失败事件 (防止某张图坏了卡住整个流程)
            imgObj.onerror = function () {
                // 失败时使用默认图，或者就传空字符串
                var fallbackSrc = ''; //'default.jpg';
                onImageDone(fallbackSrc, 'error');
            };

            // 开始加载 (必须放在最后)
            imgObj.src = src;
        }
        console.log('results', results);
    }

    function afterLoad() {
        $cardList.html(cateHtml);

        // 再渲染各个分类标题下的卡牌
        $.each(getCardList(nav), function (key, row) {
            let itemHtml = getListItemHtml(row);
            // 英雄牌
            if (nav === 1) {
                if (cateRowId === 2) { // 关键词
                    if (row.heroCard && row.heroCard.keywordDescriptionIDList) {
                        $.each(row.heroCard.keywordDescriptionIDList, function (key, val) {
                            if (val === 0) {
                                return;
                            }
                            // 一张卡牌可能有多个关键词，可以重复展示卡牌
                            appendHtml(val, 2, itemHtml);
                        });
                    }
                } else {
                    let cid = {
                        1: row.relationID, // 阵营
                        3: row.quality, // 品阶
                    }[cateRowId];
                    if (!cid) {
                        return;
                    }
                    appendHtml(cid, cateRowId, itemHtml);
                }
            }
            // 天赋牌
            if (nav === 2) {
                let cid = {
                    1: row.quality, // 品阶
                    2: row.talentCard ? row.talentCard.grpID : 0, // 解锁
                }[cateRowId];
                if (!cid) {
                    return;
                }
                appendHtml(cid, cateRowId, itemHtml);
            }
            // 装备牌
            if (nav === 3) {
                if (row.equipCard) {
                    let cid = {
                        1: row.equipCard.atlasSubType, // 相关
                        2: row.equipCard.equipTypeID, // 类型
                    }[cateRowId];
                    if (!cid) {
                        return;
                    }
                    appendHtml(cid, cateRowId, itemHtml);
                }
            }
            // 效果牌
            else if (nav === 4) {
                let cid = {
                    1: row.quality, // 品阶
                    2: row.relationID, // 阵营
                    3: row.effectCard ? row.effectCard.grpID : 0, // 解锁
                }[cateRowId];
                if (cateRowId === 2 && cid === 0) { // 通用===0
                } else if (!cid) {
                    return;
                }
                appendHtml(cid, cateRowId, itemHtml);
            }
        });

        // 若分类标题下无数据，则不显示该分类标题
        $cardList.find('.cards-l-li').each(function () {
            if ($(this).find('.li-detail').length) {
                $(this).show();
            } else {
                $(this).hide();
            }
        });

        // 渲染后执行
        afterRenderList();
    }

    // 往分类标题下追加卡牌
    function appendHtml(cid, cateRowId, itemHtml) {
        let $li = $cardList.find(`.cards-l-li[data-id=${cid}][data-row=${cateRowId}]`);
        if ($li.length === 0) {
            return;
        }
        $li.find('.li-cards').append(itemHtml);
    }
}

var firstClick = true;
// after 渲染列表
function afterRenderList() {
    let $cardList = getCardListBox();
    // 是否有卡牌显示
    let $visItems = $cardList.find('.li-detail:visible');
    if ($visItems.length === 0) {
        // 无列表结果提示
        $('.cards-err').show();
        // 右边信息隐藏
        $('.cards-r-box').hide();
    } else {
        $('.cards-err').hide();
        $('.cards-r-box').show();

        if (!isMobile) {
            // 自动触发第一个卡牌的点击事件，以显示右边的卡牌信息
            $visItems.eq(0).click();
        }
    }

    // 指定跳转英雄
    if (getCurNav() == 1 && firstClick) {
        let heroId = Milo.urlRequest('heroId');
        if (heroId && $('[data-id=' + heroId + ']').length > 0) {
            heroScrollToItem('.cards-yx .cards-l-list', '[data-id=' + heroId + ']');
        }
        firstClick = false;
    }
}

/**
 * 筛选卡牌列表结果
 * @param searchValue 搜索卡牌名称
 */
function filterList(searchValue = '') {
    let nav = getCurNav();
    let $cardList = getCardListBox(nav);

    // 不搜索则匹配全部
    if (searchValue === '') {
        renderList();
    } else {
        let allItemHtml = '';
        $.each(getCardList(nav), function (key, row) {
            // let $item = $cardList.find(`.li-detail[data-id=${row.id}]`);
            // 匹配卡牌名称
            if (row.name.toLowerCase().includes(searchValue)) {
                // $item.show();
                allItemHtml += getListItemHtml(row);
            } else {
                // $item.hide();
            }
        });
        if (allItemHtml) {
            // 不显示列表的分类标题，所有卡牌合并在一起
            let noneCateHtml = getListCateTitleHtml();
            $cardList.html(noneCateHtml);
            $cardList.find('.li-cards').html(allItemHtml);
        } else {
            $cardList.html('');
        }
    }

    // 渲染后执行
    afterRenderList();
}

// 搜索框
var $searchInput = $('.cards-search input');
// 清空搜索框
function clearSearchInput() {
    $searchInput.val('');
    $('.cards-err').hide();
}
// 搜索框检索
$searchInput.on('change', function() {
    let $cardBox = getCardBox();
    // 清空分类筛选项，第一个选中
    $cardBox.find('.cards-l-top a').removeClass('on').eq(0).addClass('on');

    // 忽略大小写
    let searchValue = $(this).val().toLowerCase();
    // console.log('searchValue', searchValue);

    // 筛选列表结果
    filterList(searchValue);
});

var chooseCardInfo = {
    id: 0,
    name: '',
    data: {},
    navId: 0,
    navShort: '',
    navName: '',
}

// 点击列表卡牌
$(document).on('click', '.li-detail', function (event) {
    let id = $(this).data('id');

    let detailName = $(this).data('name');
    let nav = $(this).parents('.cards-detail').data('id');
    let navShort = ''
    let navName = ''
    switch (parseInt(nav)) {
        case 1:
            navShort = 'yxp';
            navName = '英雄';
            break;
        case 2:
            navShort = 'tfp';
            navName = '天赋牌';
            break;
        case 3:
            navShort = 'zbp';
            navName = '装备牌';
            break;
        case 4:
            navShort = 'xgp';
            navName = '效果牌';
            break;
        default:
            break;
    }

    // 仅用户真实点击时上报，初始化或定位代码调用 .click() 时不触发埋点
    if (event.originalEvent && navShort) {
        comm.reportEvent('btn', 'kptj_' + navShort + '_' + detailName, '卡牌图鉴' + navName + '选择')
    }
    chooseCardInfo.id = id;
    chooseCardInfo.name = detailName;
    chooseCardInfo.navId = parseInt(nav);
    chooseCardInfo.navShort = navShort;
    chooseCardInfo.navName = navName;

    if (isMobile) {
        //  $('html, body').animate({
        //     scrollTop: 0
        // }, 300); 
        // 进入详情页
        // let nav = getCurNav();
        // $('.cards-wrap').fadeOut();
        // $('.cards-wrap-d').fadeIn();
        // $('.cards-r-box').removeClass('on').eq(nav-1).addClass('on');
        // 防止来回切换大类时的问题
        // $('.cards-r-box').hide().eq(nav-1).show();

        // 展示卡牌信息
        // showCurCardInfo_M(id);
        // window.location.href = "./m_cardsdetail.html";
        window.location.href = "/cp/a20260707sfgw/m_cardsdetail.html?id=" + id + "&nav=" + nav;

    } else {
        let $cardList = getCardListBox();
        $cardList.find('.li-detail').removeClass('on');
        $(this).addClass('on');

        // 展示卡牌信息
        showCurCardInfo(id);
    }
});

/**
 * 展示当前卡牌信息
 * @param cardId 当前卡牌ID
 */
function showCurCardInfo(cardId) {
    if (!cardId) {
        let $cardList = getCardListBox();
        let $cur = $cardList.find('.li-detail.on');
        cardId = $cur.data('id');
    }
    let nav = getCurNav();
    let info = {};
    $.each(getCardList(nav), function (key, row) {
        if (row.id === cardId) {
            info = row;
        }
    });
    console.log('info', info);
    if (Object.keys(info).length === 0) {
        return;
    }
    chooseCardInfo.data = info;

    // 信息容器
    let $infoBox = $('.cards-r-box').eq(nav-1);
    // 英雄牌
    if (nav === 1) {
        // 1、说明
        let item1Html = '';
        // 有关联卡牌，支持切换
        let isSwiper = 0;
        if (info.previewCards.length) {
            isSwiper = 1;
            item1Html += getPreviewHtml(info, info.previewCards, 1);
        } else {
            item1Html += '<img src="' + info.cardImage + '" alt="">';
        }
        // 关键词
        item1Html += getKeywordDescHtml(info);
        $infoBox.find('.r-item1').html(item1Html);
        // 初始化时只设置第一个 Tab 的选中状态，不触发 click 埋点
        $('.cards-r-tab a').eq(0).addClass('on').siblings().removeClass('on');
        $infoBox.find('.cards-r-item').eq(0).addClass('on').siblings('.cards-r-item').removeClass('on');
        if (isSwiper) {
            swiperInit(1);
        }
        // 2、技能
        let data = info.heroCard;
        if (!data) {
            applyCardImageFallback($('.cards-r-box'));
            return;
        }
        let skillInfo = data.skillList[0];
        if (skillInfo) {
            // 上
            let item2Html =
                '<div class="r-item2-top">' +
                '   <img src="' + skillInfo.icon + '" alt="">' +
                '   <p>' + skillInfo.name + '</p>' +
                '   <a href="javascript:showSkillVideo(' + info.id + ', \'' + skillInfo.url + '\');" class="cards_play"></a>' +
                '</div>';
            // 中
            let skillDesc = formatSkillRichText(skillInfo.desc);
            item2Html += '<p class="cards-r-desc2">' + skillDesc + '</p>';
            // 下
            if (skillInfo.enhanceSkill && skillInfo.enhanceSkill.params) {
                let skillImages = [
                    imageBaseUrl+'/cards-num.png',
                    imageBaseUrl+'/cards-num2.png',
                    imageBaseUrl+'/cards-num3.png',
                ];
                $.each(skillInfo.enhanceSkill.params, function (key, row) {
                    let img = skillImages[key];
                    if (img) {
                        item2Html +=
                            '<div class="r-item2-b">' +
                            '   <img src="' + img + '" alt="">' +
                            '   <p>' + formatSkillRichText(row.desc) + '</p>' +
                            '</div>';
                    }
                });
            }
            $infoBox.find('.r-item2').html(item2Html);
        }
        // 3、属性
        let proInfo = data.properties;
        if (proInfo) {
            proInfo = [
                proInfo.HP, // 最大生命值
                proInfo.initEnergy + '/' + proInfo.energy, // 法力值（初始能量/最大能量）
                proInfo.phyAttack, // 物理攻击力
                proInfo.magAttack, // 法术攻击力
                proInfo.phyDefense, // 物理防御
                proInfo.magDefense, // 法术防御
                (proInfo.criticalRate / 10000 * 100) + '%', // 暴击率
                ((1 + proInfo.criticalEffect / 10000) * 100) + '%', // 暴击效果
                proInfo.attackSpeed / 10000, // 攻速
                proInfo.attackDistance, // 攻击距离
            ];
            $infoBox.find('.r-item3 .r-item3-right').each(function (key, val) {
                $(this).find('p').text(proInfo[key]);
            });
        }
        // 4、觉醒
        let awaInfo = data.awakeingCard;
        if (!awaInfo) {
            applyCardImageFallback($('.cards-r-box'));
            return;
        }
        let previewCards = getPreviewCards(awaInfo);
        let item4Html = '';
        // 有关联卡牌，支持切换
        isSwiper = 0;
        if (previewCards.length) {
            isSwiper = 1;
            item4Html += getPreviewHtml(awaInfo, previewCards, 2);
        } else {
            item4Html = '<img src="' + awaInfo.cardImage + '" alt="">';
        }
        $infoBox.find('.r-item4').html(item4Html);
        if (isSwiper) {
            swiperInit(2);
        }
    }
    // 天赋牌
    else if (nav === 2) {
        let infoHtml = '';
        // 有关联卡牌，支持切换
        let isSwiper = 0;
        if (info.previewCards.length) {
            isSwiper = 1;
            infoHtml += getPreviewHtml(info, info.previewCards, 3);
        } else {
            infoHtml += '<img src="' + info.cardImage + '" alt="">';
        }
        infoHtml += '<h2>相关</h2>';
        infoHtml += '<div class="cards-r-desc">' + info.cardGetDesc + '</div>';
        $infoBox.find('.r-item1').html(infoHtml);
        if (isSwiper) {
            swiperInit(3);
        }
    }
    // 装备牌
    else if (nav === 3) {
        let infoHtml = '';
        // 有关联卡牌，支持切换
        let isSwiper = 0;
        if (info.previewCards.length) {
            isSwiper = 1;
            infoHtml += getPreviewHtml(info, info.previewCards, 4);
        } else {
            infoHtml += '<img src="' + info.cardImage + '" alt="">';
        }

        // 来源卡牌
        let sourceHtml = '<div class="swiper-desc">';
        sourceHtml += '<div class="swiper-desc-con" style="display: block;">';
        if (info.sourceCards.length) {
            // 来源卡牌图片
            sourceHtml += '<h2>相关</h2>';
            sourceHtml += '<div class="cards-r-desc">';
            $.each(info.sourceCards, function (key, row) {
                let shapeClass = cardTypeMap[row.type] ? cardTypeMap[row.type].shape_class : 'desc-img';
                sourceHtml +=
                    '<a href="javascript:showCardImage(\'' + row.cardImage + '\', \'' + row.name + '\');" class="' + shapeClass + '">' +
                    getCardImageHtml(row) +
                    '</a>';
            });
            sourceHtml += '</div>';
        } else {
            sourceHtml += '<h2>相关</h2>';
            sourceHtml += '<div class="cards-r-desc">' + info.cardGetDesc + '</div>';
        }
        sourceHtml += '</div>';
        sourceHtml += '</div>';
        infoHtml += sourceHtml;
        $infoBox.find('.r-item1').html(infoHtml);
        if (isSwiper) {
            swiperInit(4);
        }
    }
    // 效果牌
    else if (nav === 4) {
        let infoHtml = '';
        // 来源卡牌
        let sourceHtml = '';
        if (info.sourceCards.length) {
            // 来源卡牌图片
            sourceHtml += '<h2>相关</h2>';
            sourceHtml += '<div class="cards-r-descimg">';
            $.each(info.sourceCards, function (key, row) {
                let shapeClass = cardTypeMap[row.type] ? cardTypeMap[row.type].shape_class : 'desc-img';
                sourceHtml +=
                    '<a href="javascript:showCardImage(\'' + row.cardImage + '\', \'' + row.name + '\');" class="' + shapeClass + '">' +
                    getCardImageHtml(row) +
                    '</a>';
            });
            sourceHtml += '</div>';
        } else {
            sourceHtml += '<h2>相关</h2>';
            sourceHtml += '<div class="cards-r-desc">' + info.cardGetDesc + '</div>';
        }

        // 有关联卡牌，支持切换
        let isSwiper = 0;
        if (info.previewCards.length) {
            isSwiper = 1;

            infoHtml += '<div class="cards-r-item r-item3 on">';
            infoHtml += getPreviewHtml(info, info.previewCards, 5);
        } else {
            infoHtml += '<div class="cards-r-item r-item2 on">';
            infoHtml += '<img src="' + info.cardImage + '" alt="">';
        }
        // 关键词
        // infoHtml += getKeywordDescHtml(info);
        infoHtml += sourceHtml;
        infoHtml += '</div>';
        $infoBox.html(infoHtml);
        if (isSwiper) {
            swiperInit(5);
        }
    }
    applyCardImageFallback($('.cards-r-box'));
}

// 获取关键词描述 html
function getKeywordDescHtml(info) {
    let html = '';
    if (info.heroCard) {
        $.each(info.heroCard.keywordDescription, function (key, row) {
            // 去除特殊字符 todo 后续可能需要替换为图标
            row.name = row.name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '');
            html +=
                '<div class="cards-r-desc">' +
                '   <span>' + row.name + '：</span><p>' + row.desc + '</p>' +
                '</div>';

        });
    }
    return html;
}

// 获取关联卡牌 html
function getPreviewHtml(info, previewCards, objIndex = 1, hasSelf = 1) {
    let html = '';

    let slideHtml = '';
    if (hasSelf) {
        slideHtml += getSwiperSlideHtml(info.cardImage);
    }
    $.each(previewCards, function (key, row) {
        slideHtml += getSwiperSlideHtml(row.cardImage);
    });

    html +=
        '<div class="swiper" id="cards-right'+objIndex+'">' +
        '   <div class="swiper-wrapper">' +
        slideHtml +
        '   </div>' +
        '   <div class="swiper-pagination swiper-pagination'+objIndex+'"></div>' +
        '</div>';
    return html;
}
function getSwiperSlideHtml(src) {
    return '<div class="swiper-slide" onclick="swiperSlideClick(this)">' +
        '<img src="' + src + '" alt="">' +
        '</div>';
}

function swiperSlideClick(slideElement) {
    // var swiperElement = $(slideElement).closest('.swiper')[0];
    // var swiper = swiperElement && swiperElement.swiper;
    // if (swiper) {
    //     var slideIndex = $(slideElement).index();
    //     var realIndex = parseInt($(slideElement).attr('data-swiper-slide-index'), 10);
    //     if (swiper.params.loop && !isNaN(realIndex) && typeof swiper.slideToLoop === 'function') {
    //         swiper.slideToLoop(realIndex);
    //     } else {
    //         swiper.slideTo(slideIndex);
    //     }
    // }

    // 点击切换时，记录当前点击的索引
    const currIndexName = $('.cards-r-tab').find('.on').text()
    let event = '_shuoming';
    let eventName = '说明';
    if (currIndexName === '觉醒') {
        event = '_juexing';
        eventName = '觉醒';
    } else if (chooseCardInfo.navShort != 'yxp') {
        // 如果是效果牌则没有前缀
        event = '';
        eventName = '';
    }

    comm.reportEvent('btn', 'kptj_' + chooseCardInfo.navShort + '_' + chooseCardInfo.name + event + '_glkp', '卡牌图鉴' + chooseCardInfo.navName + eventName +'关联卡牌切换');
}

// 获取关联卡牌数据
function getPreviewCards(info) {
    let previewCards = [];
    if (info.previewCards.length) {
        previewCards = info.previewCards;
    } else if (info.previewCardIDs.length) {
        console.log('previewCardIDs', info.previewCardIDs);
        // todo awaInfo.previewCards 都为空，awaInfo.previewCardIDs 很多有值
        $.each(allCardList, function (key, rows) {
            $.each(rows, function (key, row) {
                if ($.inArray(row.id, info.previewCardIDs) >= 0) {
                    previewCards.push(row);
                }
            });
        });
        console.log('previewCards', previewCards);
    }
    return previewCards;
}

function swiperInit(objIndex = 1) {
    var objId = '#cards-right'+objIndex;
    var swiper = new Swiper(objId, {
        grabCursor: true,
        effect: "creative",
        creativeEffect: {
            prev: {
                shadow: false,
                translate: ["-5%", 0, -100],
            },
            next: {
                shadow: false,
                translate: ["-5%", 0, -100],
            },
        },        
        loop:true,        
        observer:true, // 修改swiper自己或子元素时，自动初始化swiper
        observeParents:true, // 修改swiper的父元素时，自动初始化swiper
        pagination: {
            el: '.swiper-pagination'+objIndex,
            // clickable: true,
        },
        on: {
            init(){
                // $(objId).click(function(){
                //     swiper.slideNext(1000);
                // })
            },
            click: function(){
                swiper.slideNext(1000);
            },
        },
    });
}

// 弹窗展示卡牌图片
function showCardImage(src, name) {
    comm.reportEvent('btn', 'kptj_' + chooseCardInfo.navShort + '_' + chooseCardInfo.name + '_ly_' + name, '卡牌图鉴效果牌来源点击');
    
    $('#cards').find('.slot-content img').attr('src', src);
    // 延迟触发，否则会延迟显示
    setTimeout(function () {
        showOverlay('#cards');
    }, 100);
}

/**
 * 展示当前卡牌信息（H5端）
 * @param cardId 当前卡牌ID
 */
function showCurCardInfo_M(cardId) {
    let nav = getCurNav();
    let info = {};
    $.each(getCardList(nav), function (key, row) {
        if (row.id === cardId) {
            info = row;
        }
    });
    console.log('info', info);
    if (Object.keys(info).length === 0) {
        return;
    }
    chooseCardInfo.data = info;

    // 信息容器
    let $infoBox = $('.cards-r-box').eq(nav-1);
    // 英雄牌
    if (nav === 1) {
        // 1、说明
        let $swiper1 = $infoBox.find('#cards-right1');
        // 主卡牌
        $swiper1.replaceWith(getPreviewHtml(info, [], 1));
        $swiper1 = $infoBox.find('#cards-right1');
        // 觉醒卡
        let awaInfo = info.heroCard ? info.heroCard.awakeingCard : null;
        if (awaInfo) {
            $swiper1.find('.swiper-wrapper').append(getSwiperSlideHtml(awaInfo.cardImage));
        }

        let $swiperSlide = $swiper1.find('.swiper-slide');
        $swiperSlide.each(function (key, val) {
            if (key === 0) {
                // 关键词，仅第一张主牌
                $(this).append(getKeywordDescHtml(info));
            } else {
                // $(this).append('<div class="cards-r-desc"><p>关联卡牌</p></div>');
                $(this).append('<div class="cards-r-desc"><p>觉醒</p></div>');
            }
        });

        var swiper1 = new Swiper('#cards-right1', {
            slidesPerView: 'auto',
            autoHeight: true,
            slideToClickedSlide: true,
            spaceBetween: 20,
            centeredSlides: true,
            observer:true, // 修改swiper自己或子元素时，自动初始化swiper
            observeParents:true, // 修改swiper的父元素时，自动初始化swipe
            pagination: {
                el: '.swiper-pagination1',
                clickable: true,
            },
            on: {
                slideChangeTransitionEnd:function(){
                    $('.r-item2-box').eq(this.activeIndex).addClass('on').siblings().removeClass('on');

                    comm.reportEvent('btn', 'kptj_' + chooseCardInfo.navShort + '_' + chooseCardInfo.name + '_juexing', '卡牌图鉴' + chooseCardInfo.navName +'觉醒');
                    comm.reportEvent('btn', 'kptj_' + chooseCardInfo.navShort + '_' + chooseCardInfo.name + '_juexing_glkp', '卡牌图鉴' + chooseCardInfo.navName +'觉醒关联卡牌切换');
                    
                    if (swiper1_2) {
                        swiper1_2.slideTo(0, 100, false);
                    }
                    if (swiper1_3) {
                        swiper1_3.slideTo(0, 100, false);
                    }
                }
            },
        });

        // 是否有关联卡
        let hasPreview = 0;
        // 主卡牌-关联卡
        if (info.previewCards.length) {
            hasPreview = 1;
            let $swiper1_2 = $infoBox.find('#cards-right1-2');
            $swiper1_2.replaceWith(getPreviewHtml(info, info.previewCards, '1-2', 0));

            var swiper1_2 = new Swiper('#cards-right1-2', {
                grabCursor: true,
                centeredSlides: true,
                slidesPerView: "auto",
                slideToClickedSlide: true,
                pagination: {
                    el: '.swiper-pagination1-2',
                    clickable: true,
                },
            });
        }

        // 觉醒卡-关联卡
        if (awaInfo) {
            let previewCards = getPreviewCards(awaInfo);
            if (previewCards.length) {
                hasPreview = 1;
                let $swiper1_3 = $infoBox.find('#cards-right1-3');
                $swiper1_3.replaceWith(getPreviewHtml(info, previewCards, '1-3', 0));

                var swiper1_3 = new Swiper('#cards-right1-3', {
                    grabCursor: true,
                    centeredSlides: true,
                    slidesPerView: "auto",
                    slideToClickedSlide: true,
                    pagination: {
                        el: '.swiper-pagination1-3',
                        clickable: true,
                    },
                });
            }
        }

        // 有关联卡
        if (hasPreview) {
            $('.cards-r-item2').show();
        } else {
            $('.cards-r-item2').hide();
        }

        let data = info.heroCard;
        if (data) {
            let $list = $infoBox.find('.cards-r-list');

            // 2、技能
            let skillInfo = data.skillList[0];
            if (skillInfo) {
                // 上
                $list.find('.r-item2-top img').attr('src', skillInfo.icon);
                $list.find('.r-item2-top p').attr('src', skillInfo.name);
                $list.find('.r-item2-top a').attr('href', 'javascript:showSkillVideo(' + info.id + ', \'' + skillInfo.url + '\');');
                // 中
                let skillDesc = formatSkillRichText(skillInfo.desc);
                $list.find('.cards-r-desc2').html(skillDesc);
                // 下
                if (skillInfo.enhanceSkill && skillInfo.enhanceSkill.params) {
                    for (let i = 0; i < 3; i++) {
                        $list.find('.r-item2-b').eq(i).find('p').html(formatSkillRichText(skillInfo.enhanceSkill.params[i].desc));
                    }
                }
            }

            // 3、属性
            let proInfo = data.properties;
            if (proInfo) {
                proInfo = [
                    proInfo.HP, // 最大生命值
                    proInfo.initEnergy + '/' + proInfo.energy, // 法力值（初始能量/最大能量）
                    proInfo.phyAttack, // 物理攻击力
                    proInfo.magAttack, // 法术攻击力
                    proInfo.phyDefense, // 物理防御
                    proInfo.magDefense, // 法术防御
                    (proInfo.criticalRate / 10000 * 100) + '%', // 暴击率
                    ((1 + proInfo.criticalEffect / 10000) * 100) + '%', // 暴击效果
                    proInfo.attackSpeed / 10000, // 攻速
                    proInfo.attackDistance, // 攻击距离
                ];
                $list.find('.r-item3-right').each(function (key, val) {
                    $(this).find('p').text(proInfo[key]);
                });
            }
        }
    }
    // 天赋牌
    else if (nav === 2) {
        let infoHtml = '';
        // 有关联卡牌，支持切换
        let isSwiper = 0;
        /*if (info.previewCards.length) {
            isSwiper = 1;
            infoHtml += getPreviewHtml(info, info.previewCards, 2);
        } else {
            infoHtml += '<img class="cards-r-img" src="' + info.cardImage + '" alt="">';
        }*/
        if (info.previewCards.length) {
            infoHtml += '<img class="cards-r-img" src="' + info.cardImage + '" alt="">';
            infoHtml += '<div class="cards-r-desc3"><p>' + info.cardGetDesc + '</p></div>';
            infoHtml += '<div class="line"></div>';
            infoHtml += '<div class="cards-r-desc3"><span>关联卡牌</span></div>';
            if (info.previewCards.length > 1) {
                isSwiper = 1;
                infoHtml += getPreviewHtml(info, info.previewCards, 2, 0);
            } else {
                infoHtml += '<img class="cards-r-img" src="' + info.previewCards[0].cardImage + '" alt="">';
            }
        } else {
            infoHtml += '<img class="cards-r-img" src="' + info.cardImage + '" alt="">';
            // infoHtml += '<div class="line"></div>';
            // infoHtml += '<div class="cards-r-desc3"><span>相关</span></div>';
            infoHtml += '<div class="cards-r-desc3"><p>' + info.cardGetDesc + '</p></div>';
        }

        $infoBox.find('.cards-r-item').html(infoHtml);

        if (isSwiper) {
            var swiper2 = new Swiper('#cards-right2', {
                grabCursor: true,
                centeredSlides: true,
                slidesPerView: "auto",
                slideToClickedSlide: true,
                pagination: {
                    el: '.swiper-pagination2',
                    clickable: true,
                },
                on: {
                    slideChangeTransitionEnd:function(){
                        comm.reportEvent('btn', 'kptj_' + chooseCardInfo.navShort + '_'+ chooseCardInfo.data.name + '_glkp', '卡牌图鉴' + chooseCardInfo.navName + '关联卡牌切换')
                    }
                },
            });
        }
    }
    // 装备牌
    else if (nav === 3) {
        let infoHtml = '';
        // 有关联卡牌，支持切换
        let isSwiper = 0;
        if (info.previewCards.length) {
            infoHtml += '<img class="cards-r-img" src="' + info.cardImage + '" alt="">';
            infoHtml += '<div class="cards-r-desc3"><p>' + info.cardGetDesc + '</p></div>';
            infoHtml += '<div class="line"></div>';
            infoHtml += '<div class="cards-r-desc3"><span>关联卡牌</span></div>';
            if (info.previewCards.length > 1) {
                isSwiper = 1;
                infoHtml += getPreviewHtml(info, info.previewCards, 3, 0);
            } else {
                infoHtml += '<img class="cards-r-img" src="' + info.previewCards[0].cardImage + '" alt="">';
            }

            // 关联卡牌的来源
            let sourceHtml = getH5PreviewSourceHtml(info);
            if (sourceHtml) {
                infoHtml += '<div class="swiper-desc-con">';
                infoHtml += '<span>相关：</span>';
                infoHtml += sourceHtml;
                infoHtml += '</div>';
            }
        } else {
            infoHtml += '<img class="cards-r-img" src="' + info.cardImage + '" alt="">';
            // infoHtml += '<div class="line"></div>';
            // infoHtml += '<div class="cards-r-desc3"><span>相关</span></div>';
            infoHtml += '<div class="cards-r-desc3"><p>' + info.cardGetDesc + '</p></div>';
        }

        // 来源卡牌
        let isSwiper2 = 0;
        if (info.sourceCards.length) {
            infoHtml += '<div class="line"></div>';
            infoHtml += '<div class="cards-r-desc3"><span>相关卡牌</span></div>';
            if (info.sourceCards.length > 1) {
                isSwiper2 = 1;
                infoHtml += getPreviewHtml(info, info.sourceCards, '3-2', 0);
            } else {
                infoHtml += '<img class="cards-r-img" src="' + info.sourceCards[0].cardImage + '" alt="">';
            }
        }

        $infoBox.find('.cards-r-item').html(infoHtml);

        if (isSwiper) {
            var swiper3 = new Swiper('#cards-right3', {
                slidesPerView: 'auto',
                autoHeight: true,
                // spaceBetween: 20,
                centeredSlides: true,
                slideToClickedSlide: true,
                observer:true, // 修改swiper自己或子元素时，自动初始化swiper
                observeParents:true, // 修改swiper的父元素时，自动初始化swipe
                pagination: {
                    el: '.swiper-pagination3',
                    clickable: true,
                },
                on: {
                    slideChangeTransitionEnd:function(){
                        comm.reportEvent('btn', 'kptj_' + chooseCardInfo.navShort + '_'+ chooseCardInfo.data.name + '_glkp', '卡牌图鉴装备牌关联卡牌切换')
                        $infoBox.find('.preview-source-box').hide().eq(this.activeIndex).show();
                    }
                },
            });
        }
        if (isSwiper2) {
            var swiper3_2 = new Swiper('#cards-right3-2', {
                grabCursor: true,
                centeredSlides: true,
                slidesPerView: "auto",
                slideToClickedSlide: true,
                pagination: {
                    el: '.swiper-pagination3-2',
                    clickable: true,
                },
                on: {
                    slideChangeTransitionEnd:function(){
                        comm.reportEvent('btn', 'kptj_' + chooseCardInfo.navShort + '_'+ chooseCardInfo.data.name + '_ly_' + chooseCardInfo.data.sourceCards[this.activeIndex].name, '卡牌图鉴' + chooseCardInfo.navName + '来源点击')
                    }
                },
            });
        }
    }
    // 效果牌
    else if (nav === 4) {
        let infoHtml = '';
        // 有关联卡牌，支持切换
        let isSwiper = 0;
        if (info.previewCards.length) {
            infoHtml += '<img class="cards-r-img" src="' + info.cardImage + '" alt="">';
            infoHtml += '<div class="cards-r-desc3"><p>' + info.cardGetDesc + '</p></div>';
            infoHtml += '<div class="line"></div>';
            infoHtml += '<div class="cards-r-desc3"><span>关联卡牌</span></div>';
            if (info.previewCards.length > 1) {
                isSwiper = 1;
                infoHtml += getPreviewHtml(info, info.previewCards, 4, 0);
            } else {
                infoHtml += '<img class="cards-r-img" src="' + info.previewCards[0].cardImage + '" alt="">';
            }

            // 关联卡牌的来源
            let sourceHtml = getH5PreviewSourceHtml(info);
            if (sourceHtml) {
                infoHtml += '<div class="swiper-desc-con">';
                infoHtml += '<span>相关：</span>';
                infoHtml += sourceHtml;
                infoHtml += '</div>';
            }
        } else {
            infoHtml += '<img class="cards-r-img" src="' + info.cardImage + '" alt="">';
            // infoHtml += '<div class="line"></div>';
            // infoHtml += '<div class="cards-r-desc3"><span>相关</span></div>';
            infoHtml += '<div class="cards-r-desc3"><p>' + info.cardGetDesc + '</p></div>';
        }

        // 来源卡牌
        let isSwiper2 = 0;
        if (info.sourceCards.length) {
            infoHtml += '<div class="line"></div>';
            infoHtml += '<div class="cards-r-desc3"><span>相关卡牌</span></div>';
            if (info.sourceCards.length > 1) {
                isSwiper2 = 1;
                infoHtml += getPreviewHtml(info, info.sourceCards, '4-2', 0);
            } else {
                infoHtml += '<img class="cards-r-img" src="' + info.sourceCards[0].cardImage + '" alt="">';
            }
        }

        $infoBox.find('.cards-r-item').html(infoHtml);

        if (isSwiper) {
            var swiper4 = new Swiper('#cards-right4', {
                slidesPerView: 'auto',
                autoHeight: true,
                spaceBetween: 20,
                centeredSlides: true,
                slideToClickedSlide: true,
                observer:true, // 修改swiper自己或子元素时，自动初始化swiper
                observeParents:true, // 修改swiper的父元素时，自动初始化swipe
                pagination: {
                    el: '.swiper-pagination4',
                    clickable: true,
                },
                on: {
                    slideChangeTransitionEnd:function(){
                        $infoBox.find('.preview-source-box').hide().eq(this.activeIndex).show();
                    }
                },
            });
        }
        if (isSwiper2) {
            var swiper4_2 = new Swiper('#cards-right4-2', {
                grabCursor: true,
                centeredSlides: true,
                slidesPerView: "auto",
                slideToClickedSlide: true,
                pagination: {
                    el: '.swiper-pagination4-2',
                    clickable: true,
                },
                on: {
                    slideChangeTransitionEnd: function() {
                        comm.reportEvent('btn', 'kptj_' + chooseCardInfo.navShort + '_'+ chooseCardInfo.data.name + '_ly_' + chooseCardInfo.data.sourceCards[this.activeIndex].name, '卡牌图鉴' + chooseCardInfo.navName + '来源点击')
                    },
                    // 点击
                    tap() {
                        console.log('点击了 slide');
                    },
                },
            });
        }
    }
    applyCardImageFallback($('.cards-r-box'));
    $('.cards-r-box').removeClass('on').eq(nav-1).addClass('on').show();
}

// h5关联卡牌的来源 html
function getH5PreviewSourceHtml(info) {
    let html = '';
    $.each(info.previewCards, function (key, row) {
        if (row.sourceCards.length) {
            html += '<div class="preview-source-box" style="display: '+ (key===0 ? '' : 'none') +'">'; // 只显示第一个
            $.each(row.sourceCards, function (key2, row2) {
                let shapeClass = cardTypeMap[row2.type] ? cardTypeMap[row2.type].shape_class : 'desc-img';
                html +=
                    '<a href="javascript:showCardImage(\'' + row2.cardImage + '\', \'' + row2.name + '\');" class="desc-img ' + shapeClass + '">' + // todo h5暂不支持点击查看
                    getCardImageHtml(row2) +
                    '</a>';
            });
            html += '</div>';
        }
    });
    return html;
}

// 英雄卡片跳转到指定位置
function heroScrollToItem(container, item){
    const $item = $(item);

    if (!$item.length) return;

    // 移动端 .cards-l-list 无固定高度，真正的滚动容器是 .cards-wrap
    var $scrollContainer;
    if (isMobile) {
        $scrollContainer = $('.cards-wrap');
    } else {
        $scrollContainer = $(container);
    }

    var scrollTo = $item.offset().top - $scrollContainer.offset().top + $scrollContainer.scrollTop();

    $scrollContainer.animate({
        scrollTop: scrollTo - 20
    }, 300);
    $item.click();
}