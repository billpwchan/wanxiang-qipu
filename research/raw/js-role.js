// 棋手模块
(function () {
    function isMobileDevice() {
        var ua = navigator.userAgent;
        var isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        var isAndroid = /Android/i.test(ua);
        var isMiloMobile = window.Milo && typeof Milo.isMobile === 'function' && Milo.isMobile();

        return Boolean(isMiloMobile || isIOS || isAndroid);
    }

    const isMobile = isMobileDevice();
    const isHome = $('.s3-swiper').length > 0;
    const isDetail = $('.role-wrap').length > 0;
    const reportEventPlat = isMobile ? 'm' : 'pc';
    const reportDescPlat = isMobile ? 'm端' : 'PC端';

    // 棋手列表数据
    let roleList = [];
    // 棋手详情数据
    let roleData = null;

    // 请求接口
    const urlMap = {
        // list: '//vasd-cms.qq.com/cms/osgamewsq/pre/api/v1/osgamewsqwsq_info_article_3019.json?ts=' + Math.floor(Date.now() / 10000), // pre环境
        list:
            'https://vasd-cms.qq.com/cms/osgamewsq/prod/api/v1/osgamewsqwsq_info_article_3019.json?ts=' +
            Math.floor(Date.now() / 10000), // 正式环境
        detail: '//game.gtimg.cn/images/amside/ide_timer/589094_oscard_new_16.js',
        lineup: (page) => `https://game.gtimg.cn/images/amside/ide_timer/598252_oslineupbyrecommend_pro_${page}.js`,
    };

    // 初始化控制台
    // if (typeof eruda == 'object') { eruda.init() }

    // 获取数据
    if (isHome) {
        console.log('初始化棋手列表');
        initListPage();
    }
    if (isDetail) {
        console.log('初始化棋手详情');
        initDetailPage();
    }

    // 初始化首页列表
    function initListPage() {
        $.getJSON(urlMap.list, function (result) {
            roleList = (result && result.data) || [];
            console.log('棋手列表数据', roleList);

            // cms埋点：初始化
            roleTrack.initTrack();

            // 渲染棋手列表swiper
            renderRoleList();
        }).fail(function (jqXHR, textStatus, errorThrown) {
            console.error('获取棋手列表失败', textStatus, errorThrown);
        });
    }

    // 初始化详情页
    async function initDetailPage() {
        const roleId = comm.getQueryString('roleId');
        if (!roleId) {
            console.error('棋手详情页加载失败：roleId不存在');
            comm.alert('棋手详情页加载失败：roleId不存在');
            return;
        }

        try {
            let aData = null;

            // 1. 生成所有的请求 Promise 对象
            const apiRequests = $.map([urlMap.list, urlMap.detail, urlMap.lineup(1)], function (url, key) {
                return $.getJSON(url);
            });
            // 2. 等待请求所有数据
            const responses = await Promise.all(apiRequests);

            // 3. 遍历所有结果并提取 data
            for (let i = 0; i < responses.length; i++) {
                const data = responses[i];

                if (data) {
                    // 获取的列表
                    if (i === 0 && data && data.data) {
                        // 查找匹配的棋手
                        aData = data.data.find((item) => String(item.uid) === String(roleId));
                    } else if (i === 1 && data && data.lords) {
                        // 获取的详情
                        // 查找匹配的棋手
                        const detailData = data.lords.find((item) => Number(item.lordId) === Number(roleId));
                        if (detailData) {
                            aData = { ...aData, detail: detailData };
                        }
                    } else if (i === 2) {
                        // 推荐阵容：取【综合推荐】里【lordList】包含【该棋手】排序最靠前的3个阵容
                        console.log('阵容数据', data);
                        // 1. 循环阵容列表查找该棋手相关阵容，lineupData：请求数据，pageNow：当前请求页数，lineupList：推荐阵容
                        async function getLineup(lineupData, pageNow, lineupList) {
                            for (let idx = 0; idx < lineupData.length; idx++) {
                                const lineup = lineupData[idx];
                                // 3. 如果阵容中包含该棋手，将该阵容信息添加到列表
                                if (
                                    lineup.lordList &&
                                    lineup.lordList.find((item) => Number(item.id) === Number(roleId))
                                ) {
                                    lineupList.push(lineup);
                                    // 4. 如果列表已满足3个结束循环
                                    if (lineupList.length >= 3) {
                                        return lineupList;
                                    }
                                }
                            }
                            // 5. 如果循环结束后，没有3个阵容，请求下一页数据
                            if (lineupList.length < 3) {
                                try {
                                    const nextPageLineupData = await $.getJSON(urlMap.lineup(pageNow + 1));
                                    return getLineup(nextPageLineupData, pageNow + 1, lineupList);
                                } catch (err) {
                                    // 6. 获取不到下一页数据时，结束循环
                                    return lineupList;
                                }
                            }
                            return lineupList;
                        }
                        const lineupList = await getLineup(data, 1, []);
                        if (Array.isArray(lineupList) && lineupList && lineupList.length) {
                            aData = { ...aData, lineup: lineupList };
                        }
                    }
                }
            }

            // 数据获取错误
            if (!(aData && aData.detail)) {
                console.error('棋手详情页加载失败：棋手未找到对应数据 roleId:' + roleId);
            }
            if (!aData) {
                console.error('棋手详情页加载失败：CMS未找到对应数据 roleId:' + roleId);
                comm.alert(msg);
                return;
            }

            // cms埋点：初始化
            roleTrack.initTrack();

            roleData = aData;
            // 渲染详情页
            renderRoleDetail();
        } catch (err) {
            console.error('其中一个或多个请求失败了', err);
            comm.alert('其中一个或多个请求失败了');
        }
    }

    // ========== 首页：渲染棋手列表 swiper ==========
    /**
     * 获取 Swiper 当前可见的 slide 原始索引（考虑 loop 循环 + centeredSlides）
     * @param {number} realIndex - Swiper 当前 realIndex
     * @param {number} slidesPerView - 每屏可见 slide 数量
     * @param {number} totalLen - 列表总长度
     * @param {boolean} centered - 是否 centeredSlides 模式
     * @returns {number[]} 可见 slide 在 list 中的原始索引数组
     */
    function getVisibleLoopIndices(realIndex, slidesPerView, totalLen, centered) {
        const indices = [];
        if (centered) {
            // centeredSlides 模式：active 居中，两侧各取一半
            const halfBefore = Math.floor((slidesPerView - 1) / 2);
            const halfAfter = slidesPerView - 1 - halfBefore;
            for (let i = realIndex - halfBefore; i <= realIndex + halfAfter; i++) {
                indices.push(((i % totalLen) + totalLen) % totalLen);
            }
        } else {
            // 默认左对齐：从 realIndex 开始连续取 slidesPerView 个
            for (let i = 0; i < slidesPerView; i++) {
                indices.push((realIndex + i) % totalLen);
            }
        }
        return indices;
    }

    function renderRoleList() {
        const list = roleList;
        if (!list.length) return;

        // 排序，order_number大的靠前，相同则发布新的靠前
        list.sort((a, b) => {
            const ao = (a && a.order_number) || 0;
            const bo = (b && b.order_number) || 0;
            if (ao === bo) {
                return (b && b.e_published_at) - (a && a.e_published_at);
            }
            return bo - ao;
        });

        let mainHtml = '';
        let thumbHtml = '';

        $.each(list, function (index, item) {
            const basicInfo = item.basicInfo; // 基础配置
            const homepageInfo = item.homepageInfo; // 首页配置

            const documentId = item.documentId || '';
            const roleId = item.uid || ''; // 棋手ID
            const name = item.title || ''; // 棋手名称
            const en_name = (item.homepageInfo && item.homepageInfo.en_name) || 'error:roleId:' + roleId; // 棋手英文名
            const portrait =
                (isMobile
                    ? homepageInfo &&
                      homepageInfo.portrait_m &&
                      homepageInfo.portrait_m[0] &&
                      homepageInfo.portrait_m[0].url
                    : homepageInfo &&
                      homepageInfo.portrait_pc &&
                      homepageInfo.portrait_pc[0] &&
                      homepageInfo.portrait_pc[0].url) || ''; // 背景立绘
            const nameImg =
                (isMobile
                    ? homepageInfo &&
                      homepageInfo.home_name_m &&
                      homepageInfo.home_name_m[0] &&
                      homepageInfo.home_name_m[0].url
                    : homepageInfo &&
                      homepageInfo.home_name_pc &&
                      homepageInfo.home_name_pc[0] &&
                      homepageInfo.home_name_pc[0].url) || ''; // 棋手名字图片
            const lines = (basicInfo && basicInfo.lines && basicInfo.lines[0] && basicInfo.lines[0].url) || ''; // 台词音频
            const lineText = (basicInfo && basicInfo.line_text) || ''; // 台词文案
            const avatar =
                (homepageInfo && homepageInfo.avatar && homepageInfo.avatar[0] && homepageInfo.avatar[0].url) || ''; // 棋手头像

            const moreReportEvent = `${reportEventPlat}_home_qishou_${en_name}_more`;
            const moreReportDesc = `${reportDescPlat}棋手介绍-查看更多`;
            const moreLinkUrl = isMobile ? 'm_roledetail.html' : 'roledetail.html';
            const linkParams = new URLSearchParams(location.search);
            linkParams.append('roleId', roleId);
            // 主轮播 slide
            mainHtml +=
                `<div class="swiper-slide">` +
                '<img class="r-bg" src="' +
                portrait +
                '" alt="">' +
                '<div class="r-desc">' +
                '<img class="r_ti" src="' +
                nameImg +
                '" alt="">' +
                `<p class="r-t1"><a class="r-voice" data-voice="${lines}" data-enname="${en_name}"></a>“${lineText}”</p>` +
                `<a href="/cp/a20260707sfgw/${moreLinkUrl}?${linkParams.toString()}" class="r-btn" target="_blank" onclick="comm.reportEvent('btn', '${moreReportEvent}', '${moreReportDesc}');roleTrack.trackEvent('${reportEventPlat}_index_click_pic_jump', '${item.documentId}', '${item.title}');"></a>` +
                '</div>' +
                '</div>';

            const avatarEvent = `${reportEventPlat}_home_qishou_${en_name}`;
            const avatarDesc = `${reportDescPlat}棋手介绍-棋手头像`;
            // 缩略图轮播 slide
            thumbHtml +=
                `<div class="swiper-slide" onclick='comm.reportEvent("btn", "${avatarEvent}", "${avatarDesc}");'>` +
                '<img src="' +
                avatar +
                '" alt="">' +
                '<i class="rh"></i>' +
                '<p>' +
                name +
                '</p>' +
                '</div>';
        });

        $('.s3-swiper .swiper-wrapper').html(mainHtml);
        $('.s3-swiper2 .swiper-wrapper').html(thumbHtml);

        // 点击台词播放
        $('.r-t1 .r-voice').on('click', function (e) {
            e.stopPropagation();
            bgm_bg.pause();
            bgm.pause();
            $('.r-voice').removeClass('on');
            var voice = $(this).data('voice');
            bgm = new MP3_Player('r-voice', voice, false);
            bgm.play();
            $(this).addClass('on');

            // 埋点
            const en_name = $(this).data('enname');
            comm.reportEvent(
                'btn',
                `${reportEventPlat}_home_qishou_${en_name}_taici`,
                `${reportDescPlat}棋手介绍-台词语音`
            );
        });

        /**
         * 首页图鉴PV上报：移动端判断父级slide是否为swiper-slide-active，PC端判断URL hash是否为#page3
         * @param {Swiper} swiper - s3-swiper2 实例
         * @param {Array} list - 数据列表
         * @param {number} slidesPerView - 每屏可见数量
         * @param {boolean} centered - 是否centeredSlides
         */
        function trackS3IndexPv(swiper, list, slidesPerView, centered) {
            var indices = getVisibleLoopIndices(swiper.realIndex, slidesPerView, list.length, centered);
            indices.forEach(function (i) {
                var item = list[i];
                if (item && item.documentId) {
                    // cms埋点：首页棋手图鉴pv
                    roleTrack.trackPV(reportEventPlat + '_index_page_pic', item.documentId, item.title);
                }
            });
        }

        // 移动端
        if (isMobile) {
            let roleSwiper = new Swiper('.s3-swiper', {
                initialSlide: 0,
                speed: 100,
                loop: true,
                loopAdditionalSlides: 2,
                effect: 'fade',
                fadeEffect: {
                    crossFade: true,
                },
                noSwiping: true,
                noSwipingClass: 'stop-swiping',
                observeParents: true,
                observer: true,
                on: {
                    transitionStart: function () {
                        const currRole = list[this.realIndex];
                        const en_name =
                            (currRole && currRole.homepageInfo && currRole.homepageInfo.en_name) ||
                            'error:idx:' + this.realIndex;
                        const documentId = currRole && currRole.documentId;
                        comm.reportEvent('pop', `m_home_qishou_${en_name}_exposure`, `m端棋手介绍页棋手曝光`);

                        // cms埋点：首页棋手图鉴点击棋手头像
                        roleTrack.trackEvent(
                            reportEventPlat + '_index_click_pic_avatar',
                            documentId,
                            currRole.title || ''
                        );
                    },
                },
            });
            let roleSwiper2 = new Swiper('.s3-swiper2', {
                slidesPerView: 4,
                spaceBetween: 0,
                // centeredSlides: true,
                slideToClickedSlide: true,
                loop: true,
                loopAdditionalSlides: 4,
                navigation: {
                    nextEl: '.s3_next',
                    prevEl: '.s3_prev',
                },
                on: {
                    transitionStart: function () {
                        roleSwiper.slideTo(this.realIndex, 100, false);
                        bgm.pause();
                        trackS3IndexPv(this, list, 4, false);
                    },
                },
            });

            // 监听主Swiper切换到图鉴页时触发上报
            const mainSwiper = document.querySelector('.main-swiper').swiper;
            if (mainSwiper) {
                mainSwiper.on('transitionEnd', function () {
                    // 判断是否切换到第三屏（索引从0开始，第三屏是 index 2）
                    if (this.activeIndex === 2) {
                        const en_name =
                            (list[roleSwiper2.realIndex] &&
                                list[roleSwiper2.realIndex].homepageInfo &&
                                list[roleSwiper2.realIndex].homepageInfo.en_name) ||
                            'error:idx:' + roleSwiper2.realIndex;
                        comm.reportEvent('pop', `m_home_qishou_${en_name}_exposure`, `m端棋手介绍页棋手曝光`);
                        trackS3IndexPv(roleSwiper2, list, 4, false);
                    }
                });
            }
        } else {
            // PC端
            let roleSwiper;
            let roleSwiper2;
            roleSwiper = new Swiper('.s3-swiper', {
                initialSlide: 0,
                speed: 700,
                loop: true,
                loopAdditionalSlides: 2,
                noSwiping: true,
                noSwipingClass: 'stop-swiping',
                simulateTouch: false, // Swiper接受鼠标点击、拖动
                effect: 'fade',
                fadeEffect: {
                    crossFade: true,
                },
                thumbs: {
                    swiper: roleSwiper2,
                },
                observer: true, // 修改swiper自己或子元素时，自动初始化swiper
                observeParents: true, // 修改swiper的父元素时，自动初始化swiper
                on: {
                    init: function () {
                        let sw = this;
                        $('.s3-con-nav li').bind('click', function () {
                            // $(this).addClass("on").siblings().removeClass("on");
                            sw.slideTo($(this).index());
                        });
                    },
                    transitionStart: function () {
                        bgm.pause();
                        $('.s3-con-nav li').eq(this.realIndex).addClass('on').siblings().removeClass('on');

                        // 每次切换上报一次
                        const currRole = list[this.realIndex];

                        const en_name =
                            (currRole && currRole.homepageInfo && currRole.homepageInfo.en_name) ||
                            'error:idx:' + this.realIndex;
                        const documentId = currRole && currRole.documentId;
                        comm.reportEvent('pop', `pc_home_qishou_${en_name}_exposure`, `PC端棋手介绍页棋手曝光`);

                        // cms埋点：首页棋手图鉴点击棋手头像
                        roleTrack.trackEvent(
                            reportEventPlat + '_index_click_pic_avatar',
                            documentId,
                            currRole.title || ''
                        );
                    },
                },
            });
            roleSwiper2 = new Swiper('.s3-swiper2', {
                initialSlide: 0,
                slidesPerView: 5,
                spaceBetween: 0,
                speed: 200,
                centeredSlides: true,
                slideToClickedSlide: true,
                simulateTouch: true, // Swiper接受鼠标点击、拖动
                loop: true,
                loopAdditionalSlides: 4,
                navigation: {
                    nextEl: '.s3_next',
                    prevEl: '.s3_prev',
                },
                observer: true, // 修改swiper自己或子元素时，自动初始化swiper
                observeParents: true, // 修改swiper的父元素时，自动初始化swiper
                on: {
                    transitionStart: function () {
                        roleSwiper.slideTo(this.realIndex);
                        trackS3IndexPv(this, list, 5, true);
                    },
                },
            });

            // 初始化判断当前是否棋手屏，避免刷新不触发hashchange，但是会显示棋手屏的问题
            if (location.hash === '#page3') {
                const en_name = (list[0] && list[0].homepageInfo && list[0].homepageInfo.en_name) || 'error:idx:' + 0;
                comm.reportEvent('pop', `pc_home_qishou_${en_name}_exposure`, `PC端棋手介绍页棋手曝光`);
                trackS3IndexPv(roleSwiper2, list, 5, true);
            }
            // 监听URL hash变化，当切换到图鉴页(#page3)时触发上报
            $(window).on('hashchange', function () {
                // PC端：通过URL hash判断是否在图鉴页
                if (location.hash === '#page3') {
                    const en_name =
                        (list[roleSwiper2.realIndex] &&
                            list[roleSwiper2.realIndex].homepageInfo &&
                            list[roleSwiper2.realIndex].homepageInfo.en_name) ||
                        'error:idx:' + roleSwiper2.realIndex;
                    comm.reportEvent('pop', `pc_home_qishou_${en_name}_exposure`, `PC端棋手介绍页棋手曝光`);
                    // 上报cms
                    trackS3IndexPv(roleSwiper2, list, 5, true);
                }
            });
        }
    }

    // ========== 详情页：渲染棋手详情 ==========
    function renderRoleDetail() {
        console.log('棋手详情页数据', roleData);
        const documentId = (roleData && roleData.documentId) || '';
        const roleId = (roleData && roleData.roleId) || '';
        const en_name =
            (roleData && roleData.homepageInfo && roleData.homepageInfo.en_name) || 'error:roleId:' + roleId; // 棋手英文名

        // 棋手详情页曝光埋点
        comm.reportEvent('pop', `${reportEventPlat}_home_qishou_${en_name}_xq`, `${reportDescPlat}棋手详情页曝光`);

        const basicInfo = roleData && roleData.basicInfo;
        const skinConfig = roleData && roleData.skinConfig;
        const guideConfig = roleData && roleData.guideConfig;
        const detail = roleData && roleData.detail;

        const nameImg = basicInfo && basicInfo.detail_name && basicInfo.detail_name[0] && basicInfo.detail_name[0].url; // 棋手名字图
        const lines = (basicInfo && basicInfo.lines && basicInfo.lines[0] && basicInfo.lines[0].url) || ''; // 台词音频
        const linesText = (basicInfo && basicInfo.line_text) || ''; // 台词文案
        const age = (basicInfo && basicInfo.age) || ''; // 年龄
        const birthday = (basicInfo && basicInfo.birthday) || ''; // 生日
        const height = (basicInfo && basicInfo.height) || ''; // 身高
        const job = (basicInfo && basicInfo.job) || ''; // 职业
        const hates = (basicInfo && basicInfo.hates) || ''; // 讨厌
        const likes = (basicInfo && basicInfo.likes) || ''; // 喜好
        // 固定启用，且skinList中至少有一个原皮数据
        // const showSkin = roleData && roleData.enableSkinConfig
        const skinList =
            (skinConfig &&
                skinConfig.map((item) => {
                    const skin_cover = (item.skin_cover && item.skin_cover[0] && item.skin_cover[0].url) || '';
                    const skin_kv = isMobile
                        ? item.skin_kv_m && item.skin_kv_m[0] && item.skin_kv_m[0].url
                        : (item.skin_kv_pc && item.skin_kv_pc[0] && item.skin_kv_pc[0].url) || '';
                    const skin_name = item.skin_name || (roleData && roleData.title);
                    if (skin_cover && skin_kv && skin_name) {
                        return {
                            skin_cover,
                            skin_kv,
                            skin_name,
                        };
                    }
                    return undefined;
                })) ||
            []; // 皮肤配置列表
        const showGuide = roleData && roleData.enableGuideConfig;
        const guideList =
            guideConfig &&
            guideConfig.map((item) => {
                const guide_cover = (item.guide_cover && item.guide_cover[0] && item.guide_cover[0].url) || '';
                const guide_name = item.guide_name || '';
                const video_id = (item.video_info && item.video_info.tencentId) || '';
                return {
                    guide_cover,
                    guide_name,
                    video_id,
                };
            }); // 攻略配置列表

        // 棋手名称图片
        $('.role_head_info_ti img').attr('src', nameImg);
        // 台词
        $('.r-voice').css({ opacity: 1 });
        $('.r-t1')
            .contents()
            .filter(function () {
                return this.nodeType === 3;
            })
            .last()
            .replaceWith('“' + linesText + '”');
        $('.r-t1 .r-voice').attr('data-voice', lines);
        $('.r-t1 .r-voice').on('click', function (e) {
            // 埋点：台词播放
            comm.reportEvent(
                'btn',
                `${reportEventPlat}_home_qishou_${en_name}_taici`,
                `${reportDescPlat}棋手介绍-台词语音`
            );
        });
        // 年龄
        $('.info-item').eq(0).find('p').text(age);
        // 生日
        $('.info-item').eq(1).find('p').text(birthday);
        // 身高
        $('.info-item').eq(2).find('p').text(height);
        // 职业
        $('.info-item').eq(3).find('p').text(job);
        // 讨厌
        $('.info-item2').eq(0).find('p').text(hates);
        // 喜好
        $('.info-item2').eq(1).find('p').text(likes);

        // 棋手KV图片初始化，默认渲染皮肤列表第一个kv图
        $('.role_head_img img').attr('src', skinList && skinList[0] && skinList[0].skin_kv);

        // 判断是否渲染皮肤
        const skinWrapEl = $('.info-list3');
        if (skinList && skinList.length > 1 && skinList && skinList[0]) {
            let skinHtml = '';

            // 皮肤列表
            $.each(skinList, function (index, item) {
                const isActive = index === 0 ? ' active' : '';
                skinHtml +=
                    '<div class="info-item3' +
                    isActive +
                    '" data-skin-index="' +
                    index +
                    '">' +
                    '<img src="' +
                    (item && item.skin_cover) +
                    '" alt="">' +
                    '<i class="rh"></i>' +
                    '<p>' +
                    (item && item.skin_name) +
                    '</p>' +
                    '</div>';
            });

            skinWrapEl.html(skinHtml);

            // 皮肤切换：点击缩略图切换 KV 大图
            skinWrapEl.off('click', '.info-item3').on('click', '.info-item3', function () {
                let $this = $(this);
                let skinIdx = $this.data('skin-index');
                let skinItem = skinList[skinIdx];
                $('.role_head_img img').attr('src', skinItem.skin_kv);
                $this.addClass('active').siblings().removeClass('active');
            });
        } else {
            skinWrapEl.hide();
        }

        // 判断是否渲染能力介绍和关联卡牌
        const detailWrapEl = $('.list-con1');
        if (detail) {
            // 格式化富文本
            function formatRichText(desc) {
                return desc
                    ? String(desc)
                          // .replace(/<color\s*=\s*([^>]+)>/gi, '<span style="color:$1">')
                          // .replace(/<\/color\s*>/gi, '</span>')
                          .replace(/\n/g, '<br />')
                          .replace(/<\/?a[^>]*>/g, '')
                    : '';
            }

            // 能力介绍，为空隐藏
            const talents = (detail && detail.talent) || [];
            const talentWrapEl = $('.list-con1-l');
            if (talents.length) {
                talentWrapEl.show();
                let leftNav = $('.list-con1-l .list-con-nav');
                let navHtml = '';
                // 技能名字映射为上报名字
                const talentEventMap = {
                    技能: 'jineng',
                    秘技: 'miji',
                    专属: 'zhuanshu',
                };
                $.each(talents, function (index, ability) {
                    const talentEvent = `${reportEventPlat}_home_qishou_${en_name}_${talentEventMap[ability.name] || ability.name}`;
                    const talentDesc = `${reportDescPlat}棋手详情-技能介绍`;
                    let navActive = index === 0 ? ' class="on"' : '';
                    navHtml +=
                        `<a onclick="comm.reportEvent('btn', '${talentEvent}', '${talentDesc}');" data-talent-index="${index}"${navActive}>` +
                        '<div class="list-con-nav-img"><img src="' +
                        (ability.icon ||
                            'https://game.gtimg.cn/images/osgame/cp/a20260707sfgw/role/list-con-nav-img.png') +
                        '" alt="" onerror="this.onerror=null; this.src=\'https://game.gtimg.cn/images/osgame/cp/a20260707sfgw/role/list-con-nav-img.png\'"></div>' +
                        '<p>' +
                        (ability.name || '') +
                        '</p>' +
                        '</a>';
                });
                leftNav.html(navHtml);

                // 能力介绍描述初始化
                let leftInfo = $('.list-con1-l .list-con-info');
                const initTalentInfo = talents && talents[0] && talents[0].cards && talents[0].cards[0];
                leftInfo
                    .find('img')
                    .attr(
                        'src',
                        (initTalentInfo && initTalentInfo.cardImage) ||
                            'https://game.gtimg.cn/images/osgame/cp/a20260707sfgw/role/list-con-info.png'
                    );
                leftInfo
                    .find('img')
                    .attr(
                        'onerror',
                        'this.onerror=null; this.src="https://game.gtimg.cn/images/osgame/cp/a20260707sfgw/role/list-con-info.png"'
                    );
                leftInfo.find('.list-con-info-text p').text((initTalentInfo && initTalentInfo.name) || '');
                leftInfo.find('.list-con-info-text span').html(formatRichText(initTalentInfo && initTalentInfo.desc));

                // 能力切换：点击icon切换info内容
                leftNav.off('click', 'a').on('click', 'a', function () {
                    if (talents && talents[0] && talents[0].cards && talents[0].cards.length > 1) {
                        console.error(
                            '能力牌不止一个，数量：' +
                                (talents && talents[0] && talents[0].cards && talents[0].cards.length)
                        );
                        return;
                    }

                    let $this = $(this);
                    let talentIdx = $this.data('talent-index');
                    let talentInfo = talents[talentIdx] && talents[talentIdx].cards && talents[talentIdx].cards[0];
                    leftInfo
                        .find('img')
                        .attr(
                            'src',
                            (talentInfo && talentInfo.cardImage) ||
                                'https://game.gtimg.cn/images/osgame/cp/a20260707sfgw/role/list-con-info.png'
                        );
                    leftInfo
                        .find('img')
                        .attr(
                            'onerror',
                            'this.onerror=null; this.src="https://game.gtimg.cn/images/osgame/cp/a20260707sfgw/role/list-con-info.png"'
                        );
                    leftInfo.find('.list-con-info-text p').text((talentInfo && talentInfo.name) || '');
                    leftInfo.find('.list-con-info-text span').html(formatRichText(talentInfo && talentInfo.desc));
                    $this.addClass('on').siblings().removeClass('on');
                });
            } else {
                talentWrapEl.hide();
                console.warn('能力介绍为空，已隐藏');
            }

            // 关联卡牌
            const relatedCards = (detail && detail.relatedCards) || [];
            const cardWrapEl = $('.list-con1-r');
            if (relatedCards.length) {
                cardWrapEl.show();
                let rightNav = $('.list-con1-r .list-con-nav');
                let rightMore = $('.list-con1-r .more-con');
                let cardNavHtml = '';
                let cardMoreHtml = '';

                // 根据数量决定是否展示更多， 一行最大可容纳数量 m:4 PC:7（页面随宽度等比例缩放，数量是固定的）
                const hasMore = isMobile ? relatedCards.length > 4 : relatedCards.length > 7;

                $.each(relatedCards, function (index, card) {
                    const cardEvent = `${reportEventPlat}_home_qishou_${en_name}_${card.name}`;
                    const cardDesc = `${reportDescPlat}棋手详情-关联卡牌`;
                    let cardActive = index === 0 ? ' class="on"' : '';

                    if (isMobile ? index <= (hasMore ? 2 : 3) : index <= (hasMore ? 5 : 6)) {
                        cardNavHtml +=
                            `<a onclick="comm.reportEvent('btn', '${cardEvent}', '${cardDesc}');" data-card-index="${index}"${cardActive}>` +
                            '<div class="list-con-nav-img"><img src="' +
                            (card.thumb ||
                                'https://game.gtimg.cn/images/osgame/cp/a20260707sfgw/role/list-con-nav-img.png') +
                            '" alt=""></div>' +
                            '<p>' +
                            (card.name || '') +
                            '</p>' +
                            '</a>';
                    }

                    if (hasMore) {
                        cardMoreHtml +=
                            `<a onclick="comm.reportEvent('btn', '${cardEvent}', '${cardDesc}');" data-card-index="${index}"${cardActive}>` +
                            '<div class="list-con-nav-img"><img src="' +
                            (card.thumb ||
                                'https://game.gtimg.cn/images/osgame/cp/a20260707sfgw/role/list-con-nav-img.png') +
                            '" alt=""></div>' +
                            '<p>' +
                            (card.name || '') +
                            '</p>' +
                            '</a>';
                    }
                });
                if (hasMore) {
                    const moreImg = 'https://game.gtimg.cn/images/osgame/cp/a20260707sfgw/role/role_icon1_3.png';
                    cardNavHtml +=
                        '<a class="list-con-nav-more">' +
                        '<div class="list-con-nav-img">' +
                        '<img src="' +
                        moreImg +
                        '" alt="">' +
                        '</div>' +
                        '</a>';
                }

                rightNav.html(cardNavHtml);
                rightMore.html(cardMoreHtml);

                // 关联卡牌介绍描述初始化
                let rightInfo = $('.list-con1-r .list-con-info');
                const initCardInfo = relatedCards && relatedCards[0];
                rightInfo
                    .find('img')
                    .attr(
                        'src',
                        (initCardInfo && initCardInfo.cardImage) ||
                            'https://game.gtimg.cn/images/osgame/cp/a20260707sfgw/role/list-con-info.png'
                    );
                rightInfo
                    .find('img')
                    .attr(
                        'onerror',
                        'this.onerror=null; this.src="https://game.gtimg.cn/images/osgame/cp/a20260707sfgw/role/list-con-info.png"'
                    );
                rightInfo.find('.list-con-info-text p').text((initCardInfo && initCardInfo.name) || '');
                rightInfo.find('.list-con-info-text span').html(formatRichText(initCardInfo && initCardInfo.desc));

                // 关联卡牌切换：点击icon切换info内容（排除更多按钮）
                rightNav
                    .off('click', 'a:not(.list-con-nav-more)')
                    .on('click', 'a:not(.list-con-nav-more)', function () {
                        let $this = $(this);
                        let cardIdx = $this.data('card-index');
                        let cardInfo = relatedCards[cardIdx];
                        rightInfo
                            .find('img')
                            .attr(
                                'src',
                                (cardInfo && cardInfo.cardImage) ||
                                    'https://game.gtimg.cn/images/osgame/cp/a20260707sfgw/role/list-con-info.png'
                            );
                        rightInfo
                            .find('img')
                            .attr(
                                'onerror',
                                'this.onerror=null; this.src="https://game.gtimg.cn/images/osgame/cp/a20260707sfgw/role/list-con-info.png"'
                            );
                        rightInfo.find('.list-con-info-text p').text((cardInfo && cardInfo.name) || '');
                        rightInfo.find('.list-con-info-text span').html(formatRichText(cardInfo && cardInfo.desc));
                        $this.addClass('on').siblings().removeClass('on');
                    });
                rightNav.off('click', '.list-con-nav-more').on('click', '.list-con-nav-more', function () {
                    $('.list-more-list').show();
                });

                //更多列表点击事件
                rightMore.off('click', 'a').on('click', 'a', function () {
                    let $this = $(this);
                    let cardIdx = $this.data('card-index');
                    let cardInfo = relatedCards[cardIdx];
                    rightInfo
                        .find('img')
                        .attr(
                            'src',
                            (cardInfo && cardInfo.cardImage) ||
                                'https://game.gtimg.cn/images/osgame/cp/a20260707sfgw/role/list-con-info.png'
                        );
                    rightInfo
                        .find('img')
                        .attr(
                            'onerror',
                            'this.onerror=null; this.src="https://game.gtimg.cn/images/osgame/cp/a20260707sfgw/role/list-con-info.png"'
                        );
                    rightInfo
                        .find('.list-con-info-text')
                        .html(
                            '<p>' +
                                (cardInfo && cardInfo.name) +
                                '</p>' +
                                '<span>' +
                                (cardInfo && cardInfo.desc) +
                                '</span>'
                        );
                    $('.list-more-list').hide();
                    rightNav.find('a').removeClass('on');
                });
                $('.more-close').on('click', function () {
                    $('.list-more-list').hide();
                });
            } else {
                cardWrapEl.hide();
                console.warn('关联卡牌为空，已隐藏');
            }
        } else {
            detailWrapEl.hide();
        }

        // 判断是否渲染攻略视频
        const guideWrapEl = $('.list-con2').eq(0);
        if (showGuide && guideList && guideList.length) {
            guideWrapEl.show();

            let videoMain = $('.list-con2-l .list-con2-l-item');
            let videoList = $('.list-con2-r');

            // 预创建播放器容器（放在list-con2-l-item下，避免被.list-con2-l-video *的CSS影响）
            videoMain.append(
                '<div id="guide_player" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: none; z-index: 2;"></div>'
            );
            // 攻略视频
            const guidePlayer = new window.SuperPlayer({
                container: '#guide_player',
                businessConfig: {
                    appKey: '100GEgQDUcABBsOSBsSRRkGDUUNHltFDhFeDh4UXxoCGhEfCRQJEBIdGhUKQQEFHxVfRREbHEVBHApDEQMKTEsQDBYJBg9DSgNTDQwdAhhKHhseSAMHBgAHXRYBQlgGTAUTEwtOE0QCHQpMExQJAh5HUxEPGxxFQE5SQxwfD0RLBA8TSxBaAg0CEwMCFVkAGgANDAlYGhhPChwZBE5dBVYVBEUEAFxDSEFbRARDWEVORRcOSh0BRBEHWhFBDxEWDxsYDgAaGUwSRR8TARAIBkkXAwABQw4OExICHx4XEQ4RHFpMSR0AExpOHEJNBwNNTRdaHhIFWx0VAVIDGhFcEhYCHxsdRVoNCxUMGB0bHwBNRBwGThMERUkSWA4BHhINAgNdBR0bAUAOTwZCSQdeEkgCAxcSFw0RCxUAHxJAG0ENERk',
                    platform: '8670701',
                    sdtfrom: 'v7163',
                },
            });
            let currentVideoIndex = 0;

            // 渲染所有视频列表
            let videoItemHtml = '';
            $.each(guideList, function (index, video) {
                let videoActive = index === 0 ? ' on' : '';
                videoItemHtml +=
                    '<div class="list-con2-r-item' +
                    videoActive +
                    '" data-video-index="' +
                    index +
                    '">' +
                    '<img src="' +
                    ((video && video.guide_cover) || '') +
                    '" alt="">' +
                    '<a class="play-btn"></a>' +
                    '<p>' +
                    ((video && video.guide_name) || '') +
                    '</p>' +
                    '</div>';
            });
            videoList.html(videoItemHtml);

            // 初始展示第一个视频
            updateVideoMain(0);

            // 点击videoMain播放按钮播放视频
            videoMain.off('click', '.play-btn').on('click', '.play-btn', function (e) {
                e.stopPropagation();
                const video = guideList[currentVideoIndex];
                if (!(video && video.video_id)) return;

                playVideo(video);
            });

            // 点击切换视频
            videoList.off('click', '.list-con2-r-item').on('click', '.list-con2-r-item', function () {
                let $this = $(this);
                let videoIdx = $this.data('video-index');
                if (videoIdx !== undefined) {
                    updateVideoMain(videoIdx);
                    $this.addClass('on').siblings().removeClass('on');

                    // 切换视频时自动播放视频
                    const video = guideList[videoIdx];
                    playVideo(video);
                }
            });

            // 更新主视频区域
            function updateVideoMain(index) {
                currentVideoIndex = index;
                const video = guideList[index];
                videoMain.find('.list-con2-l-video img').attr('src', (video && video.guide_cover) || '');
                videoMain.find('.list-con2-l-video').show();
                videoMain.next('p').text((video && video.guide_name) || '');
                guidePlayer.stop();
                $('#guide_player').hide();
            }

            // 播放视频
            function playVideo(video) {
                // 隐藏封面，显示播放器
                videoMain.find('.list-con2-l-video').hide();
                $('#guide_player').show();
                guidePlayer.play({ vid: video.video_id });

                // 埋点：播放视频上报
                comm.reportEvent(
                    'btn',
                    `${reportEventPlat}_home_qishou_${en_name}_${video.guide_name}`,
                    `${reportDescPlat}棋手详情-攻略视频`
                );
            }
        } else {
            guideWrapEl.hide();
        }

        // 查看更多攻略按钮
        $('#more-stralist')
            .off('click')
            .on('click', function () {
                comm.reportEvent(
                    'btn',
                    `${reportEventPlat}_home_qishou_${en_name}_ckgdgl`,
                    `${reportDescPlat}棋手详情-查看更多攻略`
                );
            });

        // 推荐阵容，为空隐藏
        const lineupWrapEl = $('.list-con2').eq(1);
        if (roleData && roleData.lineup) {
            lineupWrapEl.show();
            function createListHerosHtml(heroesData) {
                var html = '';
                var bigHeros = {};
                var miniHero = [];
                $.each(heroesData, function (key, hero) {
                    if (hero.id) {
                        if (hero.type != 0) {
                            bigHeros[hero.type] = createHreoHtml(hero, 'big');
                        } else {
                            miniHero.push(createHreoHtml(hero, 'small'));
                        }
                    }
                });
                if (Object.values(bigHeros).length > 0) {
                    html += '<div class="team-hero-big">';
                    $.each(bigHeros, function (key, value) {
                        html += value;
                    });
                    html += '</div>';
                }
                if (miniHero.length > 0) {
                    html += '<div class="team-hero-min">';
                    $.each(miniHero, function (key, value) {
                        html += value;
                    });
                    html += '</div>';
                }
                return html;
            }
            function createHreoHtml(hero, type) {
                if (type === undefined) type = 'normal';
                if (!hero.id) {
                    return '';
                }
                var cardId = hero.id;
                var levelIcon = hero.levelIconV2 || '';
                var heroName = hero.name || '';
                var heroType = hero.type || 0;
                var heroImgUrl =
                    hero.icon ||
                    'https://game.gtimg.cn/images/osgame/cp/a20260707sfgw/card/icon/hero_' + cardId + '.png';
                var html = '';
                var that = this;
                if (type == 'big') {
                    html = '<div class="hero-li"><img class="hero-icon" src="' + levelIcon + '" alt="">';
                    html +=
                        '<img class="hero-li-bg" data-name="' +
                        heroName +
                        '" onclick="_Act.showCardInfo(' +
                        cardId +
                        ')" src="' +
                        heroImgUrl +
                        '" alt="">';
                    if (heroType != 0) {
                        html +=
                            '<img class="hero-icon2" src="https://game.gtimg.cn/images/osgame/cp/a20260707sfgw/team/hero-icon' +
                            heroType +
                            '.png" alt="">';
                    }
                    if (hero.equipList && hero.equipList.length > 0) {
                        html += createEquipHtml(hero.equipList);
                    }
                    html += '</div> ';
                } else if (type == 'small') {
                    html = '<div class="hero-li2"><img class="hero-icon" src="' + levelIcon + '" alt="">';
                    if (heroType != 0) {
                        html +=
                            '<img class="hero-icon2" src="https://game.gtimg.cn/images/osgame/cp/a20260707sfgw/team/hero-icon' +
                            heroType +
                            '.png" alt="">';
                    }
                    html +=
                        '<img class="hero-li-bg" data-name="' +
                        heroName +
                        '" onclick="_Act.showCardInfo(' +
                        cardId +
                        ')" src="' +
                        heroImgUrl +
                        '" alt="">';
                    html += '</div>';
                } else if (type == 'core') {
                    if (isMobile) {
                        html +=
                            '<div class="teamPop_list"><div class="pop-li"><img class="hero-icon" src="' +
                            levelIcon +
                            '" alt="">';
                        if (heroType != 0) {
                            html +=
                                '<img class="hero-icon2" src="https://game.gtimg.cn/images/osgame/cp/a20260707sfgw/team/hero-icon' +
                                heroType +
                                '.png" alt="">';
                        }
                        html +=
                            '<img class="hero-li-bg" data-name="' +
                            heroName +
                            '" onclick="_Act.showCardInfo(' +
                            cardId +
                            ')" src="' +
                            heroImgUrl +
                            '" alt="">';
                        if (hero.equipList && hero.equipList.length > 0) {
                            html += createEquipHtml(hero.equipList);
                        }
                        html += '</div><div class="sw-skill"><p>' + heroName + '</p></div></div>';
                    } else {
                        html = '<div class="hero-li"><img class="hero-icon" src="' + levelIcon + '" alt="">';
                        if (heroType != 0) {
                            html +=
                                '<img class="hero-icon2" src="https://game.gtimg.cn/images/osgame/cp/a20260707sfgw/team/hero-icon' +
                                heroType +
                                '.png" alt="">';
                        }
                        html +=
                            '<img class="hero-li-bg" data-name="' +
                            heroName +
                            '" onclick="_Act.showCardInfo(' +
                            cardId +
                            ')" src="' +
                            heroImgUrl +
                            '" alt="">';
                        if (hero.equipList && hero.equipList.length > 0) {
                            html += createEquipHtml(hero.equipList);
                        }
                        html += '<p class="hero-li-name">' + heroName + '</p></div> ';
                    }
                } else {
                    html = '<img class="hero-icon" src="' + levelIcon + '" alt="">';
                    if (heroType != 0) {
                        html +=
                            '<img class="hero-icon2" src="https://game.gtimg.cn/images/osgame/cp/a20260707sfgw/team/hero-icon' +
                            heroType +
                            '.png" alt="">';
                    }
                    html +=
                        '<img class="hero-li-bg" data-name="' +
                        heroName +
                        '" onclick="_Act.showCardInfo(' +
                        cardId +
                        ')" src="' +
                        heroImgUrl +
                        '" alt="">';
                }
                return html;
            }
            function createEquipHtml(equipList) {
                var html = '<div class="hero-skill">';
                $.each(equipList, function (key, equip) {
                    if (equip.icon) {
                        html += '<div class="skill"><img src="' + equip.icon + '" alt=""></div>';
                    }
                });
                html += '</div>';
                return html;
            }

            let teamList = lineupWrapEl.find('ul');
            let teamHtml = '';
            $.each(roleData.lineup, function (index, team) {
                var html = '';
                html += '<li>';
                html += '<div class="team-con"><div class="team-name"><p>' + (team.name || '') + '</p></div>';
                html += '<div class="team-hero">';
                html += createListHerosHtml(team.heroList || []);
                let useNum = team.useNum;
                const hasWan = useNum >= 10000;
                if (hasWan) {
                    var val = (useNum / 10000).toFixed(1);
                    useNum = val - Math.floor(val) === 0 ? val.split('.')[0] : val;
                }
                html +=
                    '<div class="team-data"><img src="https://game.gtimg.cn/images/osgame/cp/a20260707sfgw/role/team-data.png" alt=""><p>' +
                    useNum +
                    '</p><span>' +
                    (hasWan ? '万' : '') +
                    '</span></div></div>';
                html +=
                    '<a data-lineupkey="' +
                    team.key +
                    "\" href=\"javascript:comm.reportEvent('btn', '" +
                    reportEventPlat +
                    '_home_qishou_' +
                    en_name +
                    '_' +
                    team.name +
                    "_copy', '" +
                    reportDescPlat +
                    '棋手详情-复制阵容码\');" class="team-btn"></a>';
                html += '</div></li>';
                teamHtml += html;
            });
            teamList.html(teamHtml);

            // 点击复制阵容码
            var clipboard1 = new ClipboardJS('.team-btn', {
                text: function (e) {
                    console.log('复制阵容码', $(e).attr('data-lineupkey'));
                    return $(e).attr('data-lineupkey');
                },
            });
            clipboard1.on('success', function (e) {
                console.log('复制阵容码成功');
                showOverlay('#team-tips2');
            });

            clipboard1.on('error', function (e) {
                console.error('复制失败:', e);
                comm.alert('复制阵容码失败：' + e);
            });
        } else {
            lineupWrapEl.hide();
            console.warn('阵容推荐为空，已隐藏');
        }

        // 查看更多阵容按钮
        $('#more-teamlist')
            .off('click')
            .on('click', function () {
                comm.reportEvent(
                    'btn',
                    `${reportEventPlat}_home_qishou_${en_name}_ckgdzr`,
                    `${reportDescPlat}棋手详情-查看更多阵容`
                );
            });
    }
})();

var roleTrack = {
    // cms埋点：PV去重（按 eventID|documentId 组合，不同事件可同documentId）
    _trackedPvSet: {},
    getOpenId: function () {
        let openid = Milo.get('openid');
        if (!openid) {
            const storageKey = 'anonymous_id';
            let anonymousId = localStorage.getItem(storageKey);
            if (!anonymousId) {
                anonymousId = 'anon_' + Math.random().toString(36).substr(2, 9); // 生成一个随机ID
                localStorage.setItem(storageKey, anonymousId);
            }
            openid = anonymousId;
        }
        return openid;
    },
    // cms埋点：初始化
    initTrack: function () {
        // 初始化用户信息
        AegisW.user = {
            openid: this.getOpenId(), // string, gopenid 没有的情况可以用 roleid 代替
            serviceType: 'osgamewsq', // string, required
            eventID: '0', // string, required
            // contentID: '', // string, 文档ID
            locale: 'zh', // string，语言
            channelUID: 'tujian', // string, 渠道 UID，banner 详情数据中获取，找 CMS 产品确认
            columnUID: 'default', // string, 栏目UID，banner 详情数据中获取，找 CMS 产品确认
            platName: Milo.isMobile() ? (comm.isIos() ? 'IOS' : 'Android') : 'PC', // string, 平台名，枚举值 PC - PC 端；IOS - IOS 端；Android - 安卓端
            // ext1: "", // string
            // ext2: "", // string
            // ext3: "", // string
        };
    },
    // cms埋点：PV上报（按eventID+documentId去重，同一事件下同documentId只上报一次）
    trackPV: function (eventID, documentId, ext) {
        if (!eventID || !documentId) {
            console.error('[trackEvent] eventID,documentId不能为空', eventID, documentId);
            return;
        }

        // 去重：同一eventID下同documentId只上报一次，不同eventID可以同documentId
        var dedupKey = eventID + '|' + documentId;
        if (this._trackedPvSet[dedupKey]) {
            return;
        }
        this._trackedPvSet[dedupKey] = true;

        // 先赋值
        AegisW.user.eventID = eventID;
        AegisW.user.contentID = documentId;

        // 如果登录了，优先传openId
        const openId = Milo.get('openid');
        if (openId) {
            AegisW.user.openid = openId;
        }

        AegisW.reportEvent({
            name: 'pv', //（数字大小写字母和_组合，正则：^[A-Za-z0-9_]+$）
            ext1: ext, // 额外字段1
            // ext2: "", // 额外字段2
            // ext3: "", // 额外字段3
        });

        console.log('[trackEvent] 上报pv完成', eventID, documentId, ext, AegisW);
    },
    // cms埋点：自定义事件上报
    trackEvent: function (eventID, documentId, ext) {
        if (!eventID || !documentId) {
            console.error('[trackEvent] eventID,documentId不能为空', eventID, documentId);
            return;
        }

        // 先赋值
        AegisW.user.eventID = eventID;
        AegisW.user.contentID = documentId;

        // 如果登录了，优先传openId
        const openId = Milo.get('openid');
        if (openId) {
            AegisW.user.openid = openId;
        }

        AegisW.reportEvent({
            name: 'click_btn', //（数字大小写字母和_组合，正则：^[A-Za-z0-9_]+$）
            ext1: ext, // 额外字段1
            // ext2: "", // 额外字段2
            // ext3: "", // 额外字段3
        });

        console.log('[trackEvent] 上报自定义事件完成', eventID, documentId, ext, AegisW);
    },
};
