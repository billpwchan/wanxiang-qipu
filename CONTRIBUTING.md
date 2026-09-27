# 参与

谢谢你愿意帮忙。最有用的三类贡献：

1. **数据纠错**：某张牌的效果、某条路线的买法、拍卖上限和你实际打的不一样。
2. **游戏版本更新了**：新版本上线、平衡调整，告诉我们哪些牌变了。
3. **副驾截帧**：副驾在你的设备上认错了界面或卡名。

都可以直接开 [Issue](https://github.com/billpwchan/wanxiang-qipu/issues/new/choose)，模板会问需要的信息。

## 提交副驾截帧

副驾只在官方卡面合成的模拟画面上测过，真实游戏里商店、手牌、能量和回合数字的位置可能不同。

```sh
./copilot/wx --save    # 打一局，每次画面变化会存到 copilot/logs/frames/
```

打完挑几张代表性的（选棋手、商店、天赋、拍卖各一两张），连同 `copilot/logs/` 下当天的 `.jsonl` 一起附在 Issue 里。截图可能包含你的游戏昵称，发之前自己打码。我们用它写 `copilot/layout.json`（商店区、手牌区、能量和回合的位置）。

## 改代码或打法

```sh
npm test    # 数据完整性 + 50 项浏览器交互 + 副驾回放（需要 Node 22+ 和 Chrome）
```

- **没有构建步骤，也没有 npm 依赖。** 请不要引入框架或打包工具；网站是原生 ES 模块，改完刷新即可。
- **打法和数字分开。** 打法写在 `site/dist/data/plan.js`；数字由 `node scripts/build_facts.mjs` 生成到 `facts.js`，不要手改。
- **文案写给玩家看。** 短句、动词开头、用游戏里的叫法；不写「双重差分」「幸存者偏差」这类术语（`verify-site.mjs` 会检查），也不写「最强」「碾压」。统计说明放在「数据说明」里。
- **强弱由数据决定。** 从卡面推出的打法要写明是推断；想改路线的档位或推荐顺序，请附上数据（datawxq 检索器的查询条件和结果），见 [docs/methodology.md](docs/methodology.md)。
- **改了数据要同步 README。** `node scripts/sync_readme.mjs` 重写路线表；页面有变化就 `node scripts/build_readme_images.mjs` 重做配图。
- 副驾的改动请跑 `node copilot/test/run.mjs`（macOS）。认牌、界面判断、路线推断改了，测试里的预期可能要一起改，请在 PR 里说明为什么新的建议更对。

## 代码风格

- JavaScript：两空格缩进、单引号、分号；注释用中文，写「为什么」。
- Python：四空格缩进；脚本开头的文档字符串写清输入和输出路径。
- 生成文件（`facts.js`、`meta.js`、`evidence.js`、`cards.json`、`release.json`）不要手改。

## 许可

提交的代码按 [MIT](LICENSE) 许可发布。请不要提交你没有权利分发的素材。
