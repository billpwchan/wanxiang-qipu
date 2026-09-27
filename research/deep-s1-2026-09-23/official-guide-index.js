// 判断系统平台
if ((navigator.platform.indexOf('Win') !== -1) || (navigator.userAgent.indexOf('Windows') !== -1)) {
	$('.download-window-cp').addClass('show');
	$('.download-mac-cp').hide();
	PTTSendClick('pop', 'pc_xszy_Windows_exposure', 'pc端新手指引曝光');
} else {
	$('.download-window-cp').hide();
	$('.download-mac-cp').addClass('show');
	PTTSendClick('pop', 'pc_xszy_macOS_exposure', 'pc端新手指引曝光');
}

// 抓取adtag参数
function GetQueryString(name) {
	var reg = new RegExp("(^|&)" + name + "=([^&]*)(&|$)");
	var r = window.location.search.substr(1).match(reg);
	if (r != null) return unescape(r[2]);
	return null;
}
var adtag = GetQueryString("adtag");
console.log(adtag);

// 处理adtag=launcherqdq
if (adtag == "launcherqdq") {
	$('body').addClass('launcherqdq');
}



// 请求下载信息
function InitDownload() {
	$.ajax({
		url: 'https://wuji-1254960240.file.myqcloud.com/c1e5b171a06a0270bb573ac140e0fd4f/20015/m3555/1.json', // JSON数据的URL
		type: 'GET',
		dataType: 'json',
		success: function(data) {
			console.log(data);
			// 先填入默认下载
			// mobile
			$('.download-mobile .qrcode').attr('src', data.qrcode_default);
			// windows
			$('.download-window').attr('href', data.pc_default);
			// wegame
			$('.download-wegame').attr('href', data.wg_default);
			// mac
			$('.download-mac').attr('href', data.mac_default);
			// 判断是否有带adtag
			if (adtag) {
				var adtagArr = data.adtag_set;
				for (var i = 0; i < adtagArr.length; i++) {
					if (adtag == adtagArr[i].datag_param) {
						// mobile
						if (adtagArr[i].m_qrcod) {
							$('.download-mobile .qrcode').attr('src', adtagArr[i].m_qrcod);
						} else {
							$('.download-mobile').hide();
						}
						// windows
						if (adtagArr[i].pc_download) {
							$('.download-window').attr('href', adtagArr[i].pc_download);
						} else {
							$('.download-window').hide();
						}
						// wegame
						if (adtagArr[i].wg_download) {
							$('.download-wegame').attr('href', adtagArr[i].wg_download);
						} else {
							$('.download-wegame').hide();
						}
						// mac
						if (adtagArr[i].mac_dowload) {
							$('.download-mac').attr('href', adtagArr[i].mac_dowload);
						} else {
							$('.download-mac').hide();
						}
					}
				}
			}
		},
		error: function(xhr, status, error) {
			// 请求失败时的回调函数
			console.error(error);
		}
	});
}

function noAdtag(d) {

}

InitDownload();


var stepSwiper = null;

// 打开弹窗
function openDialog(id) {
	$('.dialog').show();
	$('#' + id).show().siblings('.pop').hide();
	if (id == "pop2" && stepSwiper == null) {
		initDialogSwiper();
	} else {
		setTimeout(function() {
			stepSwiper.slideToLoop(0, 0);
		}, 30)
	}
}
// 关闭弹窗
function closeDialog() {
	$('.dialog').hide();
	$('.pop').hide();
}
var player = new SuperPlayer({
	container: '#vplayer'
});
// pc视频弹窗方法
function playVideo(vid) { //e为弹窗id,vid为视频字符串
	openDialog('pop3');
	// var player = new Txplayer({
	// 	containerId: 'vplayer',
	// 	vid: vid,
	// 	width: '100%',
	// 	height: '100%',
	// 	autoplay: true
	// });
	player.play({
		vid: vid,
	});
}
// 关闭pc视频弹窗方法
function hideVideo() {
	player.stop();
	closeDialog();
	$('body').removeClass('plugin_ctrl_fake_fullscreen');
}

var innerPlayer1 = new SuperPlayer({
	container: '#vplayer-inner1',
	poster:{
      src: 'https://game.gtimg.cn/images/osgame/cp/a202609xszy/video_poster_1.jpg',
    },
});
var innerPlayer2 = new SuperPlayer({
	container: '#vplayer-inner2',
	poster:{
      src: 'https://game.gtimg.cn/images/osgame/cp/a202609xszy/video_poster_2.jpg',
    },
});
var innerPlayer3 = new SuperPlayer({
	container: '#vplayer-inner3',
	poster:{
      src: 'https://game.gtimg.cn/images/osgame/cp/a202609xszy/video_poster_3.jpg',
    },
});
var innerPlayer4 = new SuperPlayer({
	container: '#vplayer-inner4',
	poster:{
      src: 'https://game.gtimg.cn/images/osgame/cp/a202609xszy/video_poster_4.jpg',
    },
});
var innerPlayer5 = new SuperPlayer({
	container: '#vplayer-inner5',
	poster:{
      src: 'https://game.gtimg.cn/images/osgame/cp/a202609xszy/video_poster_5.jpg',
    },
});

function playInnerVideo(vid, num) {
	if (num == 1) {
		innerPlayer1.play({
			vid: vid,
		});
	}
	if (num == 2) {
		innerPlayer2.play({
			vid: vid,
		});
	}
	if (num == 3) {
		innerPlayer3.play({
			vid: vid,
		});
	}
	if (num == 4) {
		innerPlayer4.play({
			vid: vid,
		});
	}
	if (num == 5) {
		innerPlayer5.play({
			vid: vid,
		});
	}
	$('.video-box').hide();
	$('.video-inner').show();
}

// 页面导航
$('.top-nav .nav').click(function(event) {
	var _p = $(this).attr('data-move');
	moveBody(_p);
});

// 页面滚动方法
function moveBody(page) {
	$("html,body").animate({
		scrollTop: $(page).offset().top - 100
	}, 500, function() {});
}

$(window).scroll(function(e) {
	var winTop = $(window).scrollTop();
	if (winTop > $('.part1').offset().top) {
		PTTSendClick('pop', 'pc_xszy_jcgz_exposure', 'pc端新手指引基础规则介绍曝光');
	}
	if (winTop > $('.part2').offset().top) {
		$('.top-nav .nav').eq(1).addClass('on').siblings('.nav').removeClass('on');
		PTTSendClick('pop', 'pc_xszy_rmzr_exposure', 'pc端新手指引入门阵容曝光');
	}
	if (winTop > $('.part3').offset().top) {
		$('.top-nav .nav').eq(2).addClass('on').siblings('.nav').removeClass('on');
		PTTSendClick('pop', 'pc_xszy_qstj_exposure', 'pc端新手指引棋手推荐曝光');
	}
	if (winTop > $('.part4').offset().top) {
		$('.top-nav .nav').eq(3).addClass('on').siblings('.nav').removeClass('on');
		PTTSendClick('pop', 'pc_xszy_gjc_exposure', 'pc端新手指引关键词词典曝光');
	}
	if (winTop > $('.part5').offset().top) {
		$('.top-nav .nav').eq(4).addClass('on').siblings('.nav').removeClass('on');
		PTTSendClick('pop', 'pc_xszy_dsjx_exposure', 'pc端新手指引大神教学曝光');
	}
	if (winTop < $('.part2').offset().top) {
		$('.top-nav .nav').eq(0).addClass('on').siblings('.nav').removeClass('on');
	}
});

// 关键词悬浮
$('.keys').hover(function() {
	$(this).addClass('on');
}, function() {
	$(this).removeClass('on');
});
// 关键词视频
$('.keys').click(function(event) {
	var _vid = $(this).attr('data-vid');
	if (_vid) {
		playVideo(_vid);
	}
});

var vindex = 0;
// 阵容切换逻辑
$('.lineup-tab li').click(function(event) {
	if (vindex == 0) {
		innerPlayer1.pause();
	}
	if (vindex == 1) {
		innerPlayer2.pause();
	}
	if (vindex == 2) {
		innerPlayer3.pause();
	}
	if (vindex == 3) {
		innerPlayer4.pause();
	}
	if (vindex == 4) {
		innerPlayer5.pause();
	}
	var _index = $(this).index();
	vindex = $(this).index();
	$(this).addClass('on').siblings('li').removeClass('on');
	$('.lineup-content .lineup').eq(_index).addClass('current').siblings('.lineup').removeClass('current');
	firstTab(_index + 1);
	if (_index == 0) {
		playInnerVideo('e1284rtzoq0', 1);
	}
	if (_index == 1) {
		playInnerVideo('r1284pzl2o2', 2);
	}
	if (_index == 2) {
		playInnerVideo('b12847edijn', 3);
	}
	if (_index == 3) {
		playInnerVideo('e1284uuzil2', 4);
	}
	if (_index == 4) {
		playInnerVideo('n128461rlih', 5);
	}
});

$('.tablist a').click(function(event) {
	var _index = $(this).index();
	$(this).addClass('on').siblings('a').removeClass('on');
	$(this).parent('.tablist').siblings('.boxlist').find('.box').eq(_index).addClass('on').siblings('.box').removeClass('on');
	if (vindex == 0 && _index != 0) {
		innerPlayer1.pause();
	}
	if (vindex == 1 && _index != 0) {
		innerPlayer2.pause();
	}
	if (vindex == 2 && _index != 0) {
		innerPlayer3.pause();
	}
	if (vindex == 3 && _index != 0) {
		innerPlayer4.pause();
	}
	if (vindex == 4 && _index != 0) {
		innerPlayer5.pause();
	}
});

function firstTab(num) {
	$('.lineup' + num).find('.tablist').find('a').eq(0).addClass('on').siblings('a').removeClass('on');
	$('.lineup' + num).find('.boxlist').find('.box').eq(0).addClass('on').siblings('.box').removeClass('on');
}

$('.skill-list div').click(function(event) {
	var _index = $(this).index();
	$(this).addClass('current').siblings('div').removeClass('current');
	$(this).parent('.skill-list').siblings('.declist').find('div').eq(_index).addClass('current').siblings('div').removeClass('current');
});

var swiper1 = new Swiper(".mySwiper-1", {
	autoplay: {
		delay: 5000,
		disableOnInteraction: false,
	},
	loop: true,
	speed: 800,
	mousewheel: false,
	pagination: {
		el: '.swiper-pagination1',
		clickable: true,
	},
	navigation: {
		nextEl: '.btn-next1',
		prevEl: '.btn-prev1',
	},
});

var swiper2 = new Swiper(".mySwiper-2", {
	autoplay: {
		delay: 5000,
		disableOnInteraction: false,
	},
	// effect: 'fade',
	loop: true,
	speed: 800,
	mousewheel: false,
	pagination: {
		el: '.swiper-pagination2',
		clickable: true,
	},
	navigation: {
		nextEl: '.btn-next2',
		prevEl: '.btn-prev2',
	},
});


var swiper3 = new Swiper(".mySwiper-3", {
	autoplay: {
		delay: 5000,
		disableOnInteraction: false,
	},
	loop: true,
	speed: 800,
	mousewheel: false,
	pagination: {
		el: '.swiper-pagination3',
		clickable: true,
	},
	navigation: {
		nextEl: '.btn-next3',
		prevEl: '.btn-prev3',
	},
});

var swiper4 = new Swiper(".mySwiper-4", {
	autoplay: false,
	loop: false,
	speed: 800,
	noSwiping: true,
	noSwipingClass: 'no-swiper',
});

var swiper5 = new Swiper(".mySwiper-5", {
	autoplay: {
		delay: 5000,
		disableOnInteraction: false,
	},
	loop: true,
	speed: 800,
	mousewheel: false,
	pagination: {
		el: '.swiper-pagination5',
		clickable: true,
	},
	navigation: {
		nextEl: '.btn-next5',
		prevEl: '.btn-prev5',
	},
});

var swiper6 = new Swiper(".mySwiper-6", {
	autoplay: {
		delay: 5000,
		disableOnInteraction: false,
	},
	loop: true,
	speed: 800,
	mousewheel: false,
	pagination: {
		el: '.swiper-pagination6',
		clickable: true,
	},
	navigation: {
		nextEl: '.btn-next6',
		prevEl: '.btn-prev6',
	},
});



$('.intro-nav a').click(function(event) {
	var _index = $(this).index();
	if (_index == 0) {
		swiper1.slideToLoop(0, 0);
		swiper1.autoplay.start();
	}
	if (_index == 1) {
		swiper2.slideToLoop(0, 0);
		swiper2.autoplay.start();
	}
	if (_index == 2) {
		swiper3.slideToLoop(0, 0);
		swiper3.autoplay.start();
	}
	if (_index == 4) {
		swiper5.slideToLoop(0, 0);
		swiper5.autoplay.start();
	}
	if (_index == 5) {
		swiper6.slideToLoop(0, 0);
		swiper6.autoplay.start();
	}
	$(this).addClass('on').siblings('a').removeClass('on');
	$('.intro-content .intro-box').eq(_index).addClass('current').siblings('.intro-box').removeClass('current');
});

function initDialogSwiper() {
	stepSwiper = new Swiper(".stepSwiper", {
		autoplay: {
			delay: 5000,
			disableOnInteraction: false,
		},
		// effect: 'fade',
		loop: true,
		speed: 800,
		mousewheel: false,
		pagination: {
			el: '.swiper-pagination-step',
			clickable: true,
		},
		// observer: true,        // 监听swiper内部dom变化
		// observeParents: true, 
		navigation: {
			nextEl: '.btn-next-step',
			prevEl: '.btn-prev-step',
		},
	});
}


// 复制阵容
var clipboard = new ClipboardJS('.btn-copy');
clipboard.on('success', function(e) {
	e.clearSelection();
	openDialog('pop1');
});

clipboard.on('error', function(e) {
	console.error('Action:', e.action);
});

// 游戏人物切换
$('.hero-nav .avatar').click(function(event) {
	var _index = $(this).index();
	$(this).addClass('on').siblings('.avatar').removeClass('on');
	$('.herolist .hero').eq(_index).addClass('current').siblings('.hero').removeClass('current');
});

function getUrlQuery(url) {
	if (!url) return '';
	if (url.includes('?')) {
		return url.split('?')[1];
	}
	return '';
}
var _url = window.location.href;
var _hash = getUrlQuery(_url);
$('.more').click(function(event) {
	if (_hash) {
		var url = 'https://wxq.qq.com/cp/a20260707sfgw/teamlist.html?' + _hash;
	} else {
		var url = 'https://wxq.qq.com/cp/a20260707sfgw/teamlist.html'
	}
	window.open(url);
});

$('.home, .logo').click(function(event) {
	if (_hash) {
		var url = 'https://wxq.qq.com/cp/a20260707sfgw/index.html?' + _hash;
	} else {
		var url = 'https://wxq.qq.com/cp/a20260707sfgw/index.html'
	}
	window.open(url);
});


setTimeout(function() {
	document.querySelectorAll('button, a, input, select, textarea, div, span, p').forEach(el => {
		el.setAttribute('tabindex', '-1');
	});
}, 300);