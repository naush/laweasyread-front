# 0.4.7.2
* 暫時不想處理 Firefox 的支援，故修改 `Gruntfile.js` 使能以 `grunt chrome` 指令即僅打包 Chrome extension 需要的檔案，免去安裝與設定 Mozilla Addon SDK （以及 python ）的困擾。
* 修正 #18 ，即全國法規資料庫中，部分項中的分款偵測問題。

# 0.4.7
2014-08-05
修正 #25，即因全國法規資料庫改版，浮動視窗空白的問題，亦因此需要新的權限 `webRequest` 與 `webRequestBlocking` 。

# 0.4.6.5 
2013-09-01
* 修正「自動轉換」不會自動打勾的問題。
* 加入新圖示以利區分當前網頁是否會自動轉換。

# 0.4.6
2013-08-27
* 允許取消「自動轉換」。
* 將「隨打隨轉」內嵌進外掛中。

# 0.4.5.6
2013-08-26
* 修正法規編章節款目的「之一」造成的錯誤。
* 支援更多條號引述格式。

# 0.4.5.1
2013-08-25
* 支援手動加入例外網站。
* 部分修正浮動視窗文字被蓋住的問題。

# 0.4.2.5
2013-08-09
* 上傳至 Chrome 線上應用程式商店。
* 支援浮動視窗。