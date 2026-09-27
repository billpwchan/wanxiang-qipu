var comm = {
    userInfo: null,
    roleInfo: null,
    isBind: false,
    actId: '30_KbMClE',
    source: Milo.isMobile() ? 'web' : 'pc', // pc/web 来源
    adtag: Milo.urlRequest('adtag') || Milo.urlRequest('ADTAG') || (Milo.isMobile() ? 'm' : 'pc'),
    eventPrefix: Milo.isMobile() ? 'm' : 'pc', // 事件前缀
    //初始化登录态
    initLogin: function (callback) {
        var _this = this;
        var params = Milo.getUrlParams();

        Milo.checkLogin({
            iUseQQConnect: true, //如果当前活动使用的互联登录,请将改参数设置true
            success: function (user) {
                console.log(user, '是否登录res=========');
                if (user.isLogin) {
                    _this.userInfo = user.userInfo;
                    _this.userInfo['isLogin'] = user.isLogin;
                    // 更新埋点
                    console.log(Milo.get('openid'))
                    aegis.setConfig({
                        uin: Milo.get('openid'),
                    });

                    $('#unlog').hide()
                    $('#log').show()

                    // 过滤html标签
                    var tempName = '<p>'+ (comm.userInfo.nickName || params['nickname'] || params['nickName'] || '') +'</p>';
                    $('#nickname').text($(tempName).text())

                    // if ( Milo.isQQApp() || Milo.isWxApp() ) {
                    //     $('#btn_logout').hide()
                    // }

                    console.log(_this.userInfo, "userInfo====>");
                    if ( typeof callback == 'function' ) {
                        callback()
                        return
                    }
                }
            },
            fail: function (res) {
                // 首次进入 QQ、微信自动登录
                console.log(parseInt(Milo.get('enter')) !== 1)
                if (parseInt(Milo.get('enter')) !== 1 ) {
                    Milo.set('enter', 1)
                    if (Milo.isQQApp()) {
                        _this.loginByQQ();
                    }
                    if (Milo.isWxApp()) {
                        _this.loginByWx();
                    }
                }
                console.log(res, '是否登录fail==========');
            }
        })
    },
    initCheck: function () {
        var _this = this

        // 检查登录
        if (!_this.userInfo) {
            _this.login()
            return false
        }

        return true
    },
    checkHandle: function () {
        var _this = this

        if ( !_this.initCheck() ) {
            return false
        }

        return true
    },
    loginByQQ: function () {
        if (Milo.isMobile()) {
            Milo.mobileLoginByQQConnect({});
        } else {
            Milo.loginByQQConnect({
                appId: '102808415',
                scope: 'get_user_info',
                state: 'STATE',
                redirectUri: 'https://milo.qq.com/comm-htdocs/login/qc_redirect.html',
                sUrl: '', //登录之后的跳转地址
            });
        }
    },
    loginByWx: function () {
        if (Milo.isMobile()) {
            // 浏览器使用活动弹窗
            if ( !Milo.isWxApp() ) {
                showOverlay($('#login-copy'))
                PTTSendReport('btn', comm.eventPrefix + '_' +'login_wx_ddtc_exposure', comm.eventPrefix + '端微信登录兜底弹窗曝光')
                comm.reportEvent('btn', 'login_wx_ddtc_exposure', '微信登录兜底弹窗曝光')
                return
            }
            Milo.mobileLoginByWX({
                scope: 'snsapi_userinfo',
                lang: 'zh_CN',
                openlink: '',
                callback: () => {
                }
            })
        } else {
            Milo.loginByWX({
                appId: 'wx715ee216af3a7e22',//游戏在微信的appid，默认为腾讯游戏活动号
                gameDomain: 'wxq.qq.com',
                lang: 'zh_CN',//返回的用户信息中省市的语言版本
                callback: null,//登录成功后的回调
            })
        }
    },
    loginOut: function () {
        comm.reportEvent('btn', 'fbh_home_logout', '首页注销')

        //登陆注销
        Milo.logout()
        location.reload()
    },
    // 获取预约channelId qq-pc 1 qq-移动 2 wx-pc 3 wx-移动 4
    getReserveChannelType() {
        if ( Milo.isMobile() ) {
            if ( Milo.isQQApp() ) {
                return 2
            }
            return 4
        }

        return comm.userInfo.acctype === 'wx' ? 3 : 1
    },
    // 去微信小程序
    goMiniApp() {
        var query = encodeURIComponent(`adtag=${comm.adtag}`)
        // 微信直接拉起小程序
        location.href = `weixin://dl/business/?appid=wx0ea3d4892f00f720&path=pages/pre-book-land/pre-book-land&query=${query}&env_version=release`;
    },
    ajaxFail: function (res) {
        if (res.iRet === 101 || res.iRet === '101') {
            this.login();
        } else if (res.iRet === 99999 || res.iRet === '99999') {
            this.alert('活动未开始，敬请期待');
        } else {
            if (res.sMsg) {
                this.alert(res.sMsg);
            } else {
                this.alert("系统繁忙，请稍后再试！");
            }
        }
    },
    //登录
    login: function () {
        var _this = this

        // if (Milo.isQQApp()) {
        //     this.loginByQQ();
        //     return;
        // }
        // if (Milo.isWxApp()) {
        //     this.loginByWx();
        //     return;
        // }

        showOverlay($('#login-choose'))
    },
    alert: function (text) {
        $('#system-tips .slot-content').text(text)
        showOverlay($('#system-tips'))
    },
    isMsdkV5: function () {
        var version = this.getMsdkVersion();
        return version.startsWith('5.');
    },
    isMsdkV3: function () {
        return !!(navigator.userAgent.match(/msdk/i) || (milo.request('msdkEncodeParam') != '' && milo.request('msdkEncodeParam') != 'null') || (milo.request('itopencodeparam') != '' && milo.request('itopencodeparam') != 'null' && milo.request('version').startsWith('5.')));
    },
    getMsdkVersion: function () {
        var agent = window.navigator.userAgent;
        var start = agent.indexOf("MSDK");
        var msdkString = agent.substring(start, agent.length).split(" ")[0];
        return msdkString.replace('MSDK/', '');
    },
    isMsdk: function () {
        return !!(this.isMsdkV5() || this.isMsdkV3());
    },
    isIos: function () {
        return /iphone|ipod|ipad/i.test(window.navigator.userAgent.toLowerCase())
    },
    isAndroid: function () {
        return /android/i.test(window.navigator.userAgent.toLowerCase());
    },
    htmlEncode: function (str) {
        var simpleStr = str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/'/g, '&#39;')
            .replace(/"/g, '&quot;');

        return simpleStr;
    },
    htmlDecode: function (str) {
        var simpleStr = str.replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&#39;/g, "'")
            .replace(/&quot;/g, '"');

        return simpleStr;
    },
    getQueryString: function (name) {
        var reg = new RegExp("(^|&)" + name + "=([^&]*)(&|$)");
        var r = window.location.search.substr(1).match(reg);
        if (r != null) return unescape(r[2]);
        return null;
    },
    appendUrlParams(url, params = {}) {
        if (!params || Object.keys(params).length === 0) return url;

        // 解析原有参数
        const [baseUrl, queryString] = url.split("?");
        const urlParams = new URLSearchParams(queryString || "");

        // 合并新参数（会覆盖同名的旧参数）
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                urlParams.set(key, value);
            }
        });

        return baseUrl + "?" + urlParams.toString();
    },
    // type btn/pop name 事件 msg 事件备注 ext 扩展字段
    reportEvent(type, name, msg, ext1, ext2, ext3) {
        name = comm.eventPrefix + '_' + name
        msg = comm.eventPrefix + '端' + msg
        console.log(`reportEvent ptt =====> type: ${type} event: ${name}`)
        PTTSendClick(type, name, msg)

        name = (type + '_' + name).replace(/_/g, '.');
        console.log('reportEvent aegis =====> ', name)

        aegis.reportEvent({
            name: 'event.' + name, // 必填，前缀必须为event. 按照{模块}.{子模块}.{action}的方式上报
            ext1: ext1, // 可选，如果是社群，此处固定传unionid 3
            ext2: ext2, // 可选 4
            ext3: ext3, // 可选 5
        })
    },
    isAdtagO2() {
        return location.href.toLowerCase().includes('adtag-o2')
    },
    //pc下载
    reportDownloadPC() {
        if(comm.isAdtagO2()) {
            if(comm.userInfo && comm.userInfo.isLogin) {
                window.o2Aegis.report({name: 'pc*-*pc*-*home*-*zjcs*-*download*-*pc_pc端PC端终极测试PC下载'});
                comm.reportEvent('btn', 'pc_home_zjcs_download_pc', 'PC端终极测试PC下载');
                window.open('https://file.osgame.qq.com/launcher/publish/wzwxq_publish_setup.exe', '_blank');
            }else {
                comm.login();
            }
        }else {
            comm.reportEvent('btn', 'pc_home_zjcs_download_pc', 'PC端终极测试PC下载');
            window.open('https://file.osgame.qq.com/launcher/publish/wzwxq_publish_setup.exe', '_blank');
        }
    },
    //wegame下载
    reportDownloadWG() {
        if(comm.isAdtagO2()) {
            if(comm.userInfo && comm.userInfo.isLogin) {
                window.o2Aegis.report({name: 'pc*-*pc*-*home*-*zjcs*-*download*-*wegame_pc端PC端终极测试wegame下载'});
                comm.reportEvent('btn', 'pc_home_zjcs_download_wegame', 'PC端终极测试wegame下载');
                window.open('https://dldir1.qq.com/tgc/WeGameMiniLoader.2002548.7.3.13.1331.exe', '_blank');
            }else {
                comm.login();
            }
        }else {
            comm.reportEvent('btn', 'pc_home_zjcs_download_wegame', 'PC端终极测试wegame下载');
            window.open('https://dldir1.qq.com/tgc/WeGameMiniLoader.2002548.7.3.13.1331.exe', '_blank');
        }
    },
}


if (typeof Aegis === 'function') {
    var aegis = new Aegis({
        id: 'KJeqkHqlYr01qWGJn1', // 上报应用id, 项目不同，id不同
        uin: '', // 用户唯一ID（可选）
        reportApiSpeed: false, //接口测速，勿轻易打开
        reportAssetSpeed: false, // 静态资源测速，勿轻易打开
        spa: true, // spa 应用跳转的时候开启 pv 计算
        hostUrl: 'https://rumt-zh.com' // 上报域名，中国大陆 rumt-zh.com，海外使用rumt-us.com
    });
}

Milo.loadScript("//ossweb-img.qq.com/images/js/TGMobileShare/TGMobileShare.min.js", function () {
    TGMobileShare({
        shareTitle: '王者万象棋官网-腾讯游戏',
        shareDesc: '欢迎来到万象大赛的现场，去赢得比赛，成为王者，夺下冠军的荣耀吧！',
        shareImgUrl: 'https://game.gtimg.cn/images/osgame/cp/a20260707sfgw/share.png', //分享图片尺寸200*200，且填写绝对路径
        shareLink: location.href, //分享链接要跟当前页面同域名(手Q分享有这个要求)
        actName: 'os' //点击流命名，用于统计分享量
    });
})

// 倒计时
$(function () {
    var flow_590909 = {
        actId: '30_KbMClE',
        token: 'O2oh2z',
        sData: {
        },
        success: function(res){
            console.log(res);
            if ( res.details.jData.timestamp ) {
                now = new Date(res.details.jData.timestamp * 1000)
                if ( typeof renderPlayButton === "function" ) {
                    renderPlayButton()
                }
            }
        },
        fail: function(res){
            console.log(res);
        }
    }
    // Milo.emit(flow_590909);
})
