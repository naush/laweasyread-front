LER = function(){
    var skippingTags = ["SCRIPT", "CODE", "TEXTAREA", "OPTION", "BUTTON"]; ///< 也許應該設計成CSS selector的機制
    var rules = [];
    var lawInfos = {};  ///< 法規資訊，包含暱稱資訊
    var counter = 0;

    if(true) { ///< set to true to enable debug messages
        var debugStartTime = (new Date).getTime();
        var debugOldTime = debugStartTime;
        var debug = function(str) {
            str = str ? (": " + str) : "";
            var debugNow = (new Date).getTime();
            console.log("LER (" + (debugNow - debugOldTime) + "/" + (debugNow - debugStartTime) + ")" + str);
            debugOldTime = debugNow;
        };
    }
    else var debug = function(){};

    /// 數字補零
    var zeroFill = function(num, strlen){
        for(num = num.toString(); num.length < strlen; num = "0" + num);
        return num;
    }

    /** 加上彈出式內嵌視窗
      * 只在要顯現時才去讀取該網頁，以避免無窮iframe的問題，也可節省流量考量
      * 目前只能幫已經有連結的對象加上
      * \param linkReplacer 把連結的網址轉換成要iframe的網址，不指定即不轉換
      */
    var addIFrame = function (selector, linkReplacer) {
        var eles = document.querySelectorAll(selector);
        for(var i = 0; i < eles.length; ++i) {
            var href = eles[i].getAttribute("href");
            if(!href) continue;
            if(typeof linkReplacer == "function")
                href = linkReplacer(href);
            if(typeof href != "string")
                throw new TypeError("function `linkReplacer` must return a string.");

            eles[i].style.position = "relative";
            (function() {
                var timerID;
                var iframe;
                eles[i].onmouseover = function() {
                    var isFirst = true;
                    var src = href;
                    return function() {
                        var self = this;    ///< `this` would be different later.
                        if(timerID) clearTimeout(timerID);
                        timerID = setTimeout(function() {
                            if(isFirst) {
                                iframe = document.createElement("IFRAME");
                                iframe.style.display = "none";
                                iframe.className = "LER-iframe";
                                iframe.src = src;
                                self.appendChild(iframe);
                                isFirst = false;
                            }
                            //else iframe = self.lastChild;
                            var target = (iframe.previousSibling.nodeType == 1)
                                ? iframe.previousSibling
                                : iframe.parentNode
                            ;   ///< 法規名稱目前沒有另包container，其previousSibling會是TEXT_NODE
                            iframe.style.display = "";
                            iframe.style.top = target.offsetHeight * 0.9 + "px";
                            iframe.style[target.offsetLeft > 400 ? "right" : "left"] = "0";
                        }, 350);
                    };
                }();
                eles[i].onmouseout = function(event){
                    var e = event.toElement || event.relatedTarget;
                    if(!e || e.parentNode == this || e == this) return;
                    clearTimeout(timerID);
                    if(iframe) this.lastChild.style.display = "none";
                };
            })();
        }
    };

    /** 文字轉換的主函數：每個DOM node都跑一次
      * * 無論幾種要轉換的東西，一個 Text 節點即只處理一次
      * * 用recursive DFS call，故通常會與網頁上的順序相同
      * * 會跳過 skippingTags 指定的標籤
      * * 會跳過前次呼叫時所做出來的節點
      */
    var parseElement = function(ele, inSpecial) {
        for(var next, child = ele.firstChild; child; child = next) {
            if(ele.classList.contains("LER-defaultLaw")) inSpecial = "defaultLaw";
            if(ele.tagName == 'A') inSpecial = 'A';
            next = child.nextSibling; ///< 因為ele.childNodes會變，所以得這樣
            switch(child.nodeType) {
            case 1: ///< Node.ELEMENT_NODE
                if(skippingTags.indexOf(child.tagName) >= 0) break;
                if(child.classList.contains("LER-lawName")
                    || child.classList.contains("LER-artNum")
                ) break;  ///< 如果是已經處理過的，就不用再處理
                if((child.tagName == "FRAME" || child.tagName == "IFRAME")
                    && child.contentDocument
                    && child.contentDocument.domain == document.domain
                    && child.contentDocument.readyState == "complete"
                ) child = child.contentDocument.body;
                parseElement(child, inSpecial);
                break;
            case 3: ///< Node.TEXT_NODE
                isImmediateAfterLaw = false;    ///< 這行好像不應該寫在這..
                var arr = parseText(child.data, inSpecial);
                if(arr.length == 1 && arr[0] == child.data) break;
                for(var i = 0; i < arr.length; ++i) {
                    if(typeof arr[i] == "string")
                        arr[i] = document.createTextNode(arr[i]);
                    ele.insertBefore(arr[i], child);
                }
                ele.removeChild(child);
                break;
            default: break;
            }
        }
    };
    /** 處理純文字，回傳文字與節點夾雜的陣列
      * 第一個規則的比對碎片，會馬上被用第二個規則去比對與替換
      */
    var parseText = function(text, inSpecial, ruleIndex) {
        /// 先處理一些特殊或簡單的情形
        if(!ruleIndex) ruleIndex = 0;
        if(ruleIndex >= rules.length) return [text];
        var rule = rules[ruleIndex];
        if(text.replace(/\s/g, '').length < (rule.minLength ? rule.minLength : 2))
            return [text]; ///< 如果字數太少，就直接不處理。

        /// 由於RegExp可能有子pattern，故需用exec而不宜用split和match()
        var result = [];
        for(var match, pos = 0;
            (match = rule.pattern.exec(text)) != null;
            pos = match.index + match[0].length
        ) {
            /// 每次有比對到時，先把比對位置前面的碎片丟給下一個規則
            result.push.apply(result, parseText(text.substring(pos, match.index), inSpecial, ruleIndex + 1));
            /// 然後才處理實際比對到的東西（注意match是物件而非字串；這裡是push一個node而非array）
            result.push(rule.replace(match, inSpecial));
        }
        /// 處理最後一塊碎片
        result.push.apply(result, parseText(text.substr(pos), inSpecial, ruleIndex + 1));
        return result;
    }

    /** 處理條號與法規的對應
      * 如果條號緊接於法規名稱之後，則該條號即屬於該法規
      * 若否，而已設定了「預設法規」，那就歸屬於預設法規
      * 若亦無預設法規，則對應到前一個找到的法規
      * 若未曾找到過法規，那就不指定歸屬
      */
    var defaultLaw;     ///< 預設法規，由外部指定（通常是法規資料庫中特定法規的專頁時）
    var lastFoundLaw;
    var isImmediateAfterLaw;    ///< 目前判斷此值的機制欠佳...
    var setDefaultLaw = function(arg) {
        debug("setDefaultLaw " + arg);
        return defaultLaw = (typeof arg == "string") ? lawInfos[arg] : arg;
    };

    /** 處理法院與裁判的對應
      * 原理同上，只是暫不處理「預設法院」這部分
      * （之後要處理裁判書中的「本院」其他裁判時應該還是會需要處理）
      */
    var lastFoundCourt;

    /** 比對的規則
      * 使用匿名函數設定初始值並回傳物件給rules.push
      * 實際push進入規則陣列的物件包含三個屬性：
      * \attribute pattern 正規表示式
      * \attribute replace 替換函數。第一引數為正規表示式的匹配物件，回傳字串與節點混雜的一維陣列
      * \attribute minLength 最短需要比對的字串長度。用於跳過一些不可能比對成功的情形
      */
    /// 法規名稱比對
    rules.push(function() {
        /** 讀取法規資訊，包含暱稱
          * 標點符號的略去還頗令人困擾，因為有些想留下的如：
          * * 總統副總統選舉罷免法（新 84.08.09 制定）
          * * 省（市）政府建設公債發行條例
          * * 國軍陣（死）亡官兵遺骸安葬及遺物處理辦法
          * * 高級中等以下學校及幼兒（稚）園教師資格檢定辦法
          * * 財政部與所屬國家行局公司董（理）事會暨總經理（局長）權責劃分辦法
          * * 中央銀行及中央存款保險股份有限公司現職金融檢查人員轉任行政院金融監督管理委員會及所屬機關比照改任官職等級及退撫事項辦法
          *
          * 偏偏也有一些不想留下的，例如：
          * * 中華民國與美利堅合眾國關於四十七年四月十八日、四十八年六月九日、四十九年八月三十日及五十年七月二十一日等次農業品協定之換文
          * * 核能研究所（中華民國的非營利機構）、芝加哥大學（美國阿崗國家實驗室運轉機構）及日本中央電力產業研究所三方合作交換計畫協議書（中譯本）
          * * 駐美國臺北經濟文化代表處與美國在台協會技術合作發展，發射並操作氣象，電離層及氣候之衛星星系觀測系統協議書第一號執行協定第二號修訂
          * * 駐美國台北經濟文化代表處與美國在台協會氣象預報系統發展技術合作協議第十七號執行辦法持續發展區域分析及預測系統及預警決策支援系統
          *
          * 但是，也許有使用者就是需要那些我不想留下的？
          */
        var lawNames = [];  ///< 生成比對用的表達式之用，用畢可刪
        for(var i = 0; i < pcodes.length; ++i) {
            var name = pcodes[i].name;
            if(name.length > 64) continue;
            if(/[A-Za-z，、「」]/.test(name)) continue;
            lawInfos[name] = pcodes[i]; ///< 理想上只需要編號，但是為了在遇到暱稱時也能顯示全名..
            lawNames.push(name.replace(/([\.\(\)])/g, "\$1")); ///< 加上脫逸字，因需轉成RegExp
        }
        for(var lyID in lyIDs) {   ///< 唔，目前是用Object的方式，不能像array那樣做
            var name = lyIDs[lyID];
            if(lawInfos[name]) lawInfos[name].lyID = lyID;
            else lawInfos[name] = {name: name, lyID: lyID};
            lawNames.push(name);
        }
        for(var nick in aliases) {
            var name = aliases[nick];
            if(typeof lawInfos[name] == "undefined")
                throw new ReferenceError("law name " + name + " doesn't exist.");
            lawInfos[nick] = lawInfos[name]; ///< 指到同一個物件

            /// 之後也許可以用暱稱來做點什麼...
            //if(!lawInfos[name].nicks) lawInfos[name].nicks = [];
            //lawInfos[name].nicks.push(nick);

            lawNames.push(nick);
        }
        /// 由長至短排列（以避免遇到「刑法施行法」卻比對到「刑法」）
        lawNames.sort(function(a,b){return b.length-a.length});
        var pattern = new RegExp(lawNames.join('|'), 'g');

        var replace = function(match, inSpecial) {
            ++counter;
            lastFoundLaw = lawInfos[match[0]];
            if(inSpecial == "defaultLaw") setDefaultLaw(lastFoundLaw);
            isImmediateAfterLaw = true;
            var node;
            if(inSpecial != 'A' && lastFoundLaw.PCode) {
                node = document.createElement('A');
                node.setAttribute('target', '_blank');
                node.setAttribute('href', "http://law.moj.gov.tw/LawClass/LawAll.aspx?PCode=" + lastFoundLaw.PCode);
            }
            else node = document.createElement("SPAN");
            node.setAttribute('title', lastFoundLaw.name);
            node.className = "LER-lawName";
            node.appendChild(document.createTextNode(match[0]));
            return node;
        };

        return {pattern: pattern, replace: replace, minLength: 2}; ///< 最短的是「民法」
    }());


    /** 條號比對－－支援多條文
      * 僅處理條文中提及多條文時的格式，例如行訴§18的「第十七條、第二十條至第二十二條、第二十八條第一項、第三項、第二十九條至第三十一條」
      * 「類」是為了支援所得稅法§14
      *
      * 這裡不處理：
      * * 全國法規資料庫的 "第 15-1 條"
      * * 立法院法律系統中，法規版本列表的 "第616之1, 624之1至624之8條"
      */
    rules.push(function() {
        var reNumber = "\\s*[\\d零０一二三四五六七八九十百千]+\\s*";
        var reTypes = "[條項類款目]";
        var reSplitter = "[、,或及至]";
        var rePart = "(%number%)(%type%)(\\s*之(%number%))?".replace(/%number%/g, reNumber).replace(/%type%/, reTypes);
        var pattern = "(第" + rePart + ")+";
        pattern = pattern  + "(" + reSplitter + pattern + ")*";
        pattern = new RegExp(pattern, 'g');
        rePart = new RegExp(rePart, 'g');
        //reTypes = new RegExp(reTypes, 'g');
        reSplitter = new RegExp(reSplitter, 'g');
        //reNumber = new RegExp(reNumber, 'g');

        var replace = function(match, inSpecial) {
            ++counter;
            var html = "";  ///< 待會直接用innerHTML
            var SNo = "";   ///< 連結
            reSplitter.lastIndex = 0;

            // 例如比對到 "第十八條之一第一項第九類、第二十六條第二款至第四款"，其執行結果為
            var parts = match[0].split(reSplitter);        //#=> ["第十八條之一第一項第九類", "第二十六條第二款", "第四款"]
            var glues = match[0].match(reSplitter);        //#=> [                         "、",               "至"       ]
            for(var i = 0; i < parts.length; ++i) {
                var scraps = parts[i].split(/第/g);        //#=> ["", "十八條之一", "一項", "九類"], ["", "二十六條", "二款"], ["", "四款"]
                var single = "";
                for(var j = 1; j < scraps.length; ++j) {
                    rePart.lastIndex = 0;
                    var m = rePart.exec(scraps[j]);
                    var num1 = parseInt(m[1]);
                    switch(m[2]) {
                    case "條":
                        single = "§" + num1;
                        if(i) SNo += (glues[i-1] == "至") ? "-" : ",";   ///< 處理連接詞
                        SNo += num1;
                        break;
                    default:    ///< 之後要處理簡稱，例如「項」是簡記為羅馬數字，但也要允許使用者選擇喜歡的簡記方式
                        single += "第" + num1 + m[2];
                    }
                    if(m[3]) {  ///< 理論上只在「條」的情況出現
                        var num2 = parseInt(m[4]);
                        single += "-" + num2;
                        SNo += "." + num2;
                    }
                }
                html += '<span class="LER-artNum">' + single + '</span>';

                if(i == parts.length - 1) break;    ///< 處理連接詞
                html += ((glues[i] == ",") ? "" : " ") + glues[i] + " ";
            }

            /// 處理預設法規。機制參閱此處變數宣告之處
            var law = (isImmediateAfterLaw && match.index == 0 || !defaultLaw) ? lastFoundLaw : defaultLaw;
            isImmediateAfterLaw = false;

            var node;
            if(inSpecial != 'A' && !!law && SNo && law.PCode) {  ///< 如果是「前條第一款」，那就還不會加上連結
                node = document.createElement('A');
                node.setAttribute('target', '_blank');
                var href = "http://law.moj.gov.tw/LawClass/Law";
                href += /[,-]/.test(SNo)
                    ? "SearchNo.aspx?PC=" + law.PCode + "&SNo=" + SNo   ///< 多條
                    : "Single.aspx?Pcode=" + law.PCode + "&FLNO=" + SNo.replace(".", "-") ///< 單條
                ;
                node.setAttribute('href', href);
                node.setAttribute('title', law.name + "\n" + match[0]);
            }
            else {
                node = document.createElement("SPAN");
                node.setAttribute('title', match[0]);
            }
            node.className = "LER-artNum-container";
            node.innerHTML = html;
            return node;
        };
        return {pattern: pattern, replace: replace, minLength: 3}; ///< 最短的是「第一條」
    }());

    /** 處理全國法規資料庫的 "第 15-1 條"
      */
    rules.push(function() {
        var pattern = /第\s*(\d+)(-(\d+))?\s*條/g;
        var replace = function(match, inSpecial) {
            ++counter;
            var num1 = parseInt(match[1]);
            var text = "§" + num1;
            if(match[3]) {    /// 處理全國法規資料庫的「第 15-1 條」，不會是中文數字
                text += match[2];
            }
            /// 處理預設法規。機制參閱此處變數宣告之處
            var law = (isImmediateAfterLaw && match.index == 0 || !defaultLaw) ? lastFoundLaw : defaultLaw;
            var node = document.createElement("SPAN");
            node.className = "LER-artNum-container";
            var html = ' class="LER-artNum" title="' + match[0] + '">' + text + '</';
            var href = 'http://law.moj.gov.tw/LawClass/LawSingle.aspx?Pcode=' + law.PCode + '&FLNO=' + text.substr(1);
            node.innerHTML = (inSpecial == 'A' || !law)
                ? '<span' + html + 'span>'
                : '<a target="_blank" href="' + href + '"' + html + 'a>'
            ;
            return node;
        };
        return {pattern: pattern, replace: replace, minLength: 3}; ///< 最短的是「第1條」
    }());

    /** 大法官釋字
      */
    rules.push(function() {
        var reNumber = "\\s*[\\d零０一二三四五六七八九十百千]+\\s*";
        var pattern = "(本院|司法院)?釋字第?%number%號([、及]第%number%號)*(解釋(?!文))?";
        pattern = new RegExp(pattern.replace(/%number%/g, reNumber), 'g');
        reNumber = new RegExp(reNumber, 'g');
        var replace = function(match, inSpecial) {
            ++counter;
            var container = document.createElement("SPAN");
            container.setAttribute("title", match[0]);
            container.className = "LER-jyi-container";
            var html = "釋";
            reNumber.lastIndex = 0;
            var matches = match[0].match(reNumber);
            for(var i = 0; i < matches.length; ++i) {
                var num = parseInt(matches[i]);
                if(i) html += ", ";
                if(inSpecial == "A") html += '<span class="LER-jyi">#' + num + '</span>';
                else html += '<a class="LER-jyi" target="_blank" href="http://www.judicial.gov.tw/constitutionalcourt/p03_01.asp?expno=' + num + '">#' + num + '</a>';
            }
            container.innerHTML = html;
            return container;
        };
        return {pattern: pattern, replace: replace, minLength: 4}; ///< 最短的是「釋字一號」
    }());

    /** 法院和檢察署
      * 公懲會還沒有加進來
      *
      * Notes:
      * * 雖然有「福建高院金門分院」和其檢署，但其實沒有「福建高等法院」和其檢察署。
      * * 智財法院對應的檢察署是「高檢署智財分署」，而不是「智財高分檢」或「智財法院檢察署」
      *
      * Bugs:
      * * 「大『雄檢』查了抽屜」會被比對到
      * * 福建高院會對應到台灣高院
      * * 智財分檢署不會比對到，不過倒是比對到了「智財法院檢察署」
      */
    rules.push(function() {
        var provinces = "([臺台]灣|福建)?";
        var counties = "([臺台][北中南東]|士林|板橋|新北|宜蘭|基隆|桃園|新竹|苗栗|彰化|南投|雲林|嘉義|高雄|花蓮|屏東|澎湖|金門|連江)";
        var branches = "([臺台][中南]|高雄|花蓮|金門)";
        var patterns = [
            "(最高(行政)?|智慧?財產?)法院(檢察署)?",
            provinces + "高(等法|本)?(院(" + branches + "分院)?(檢察署)?|檢署)",
            provinces + counties + "地((方法)?院|檢察?署)",
            "([臺台]?[北中]|高雄?|最)高等?行(政法院)?",
            "(([臺台]灣)?高雄)?少年?及?家事?法院",
            "([北板士雄宜]|最?高)[院檢]",
            branches + "高分[院檢]"
        ];
        var pattern = new RegExp("(" + patterns.join(")|(") + ")", 'g');

        /// 找關鍵字，如果有keyword，那麼其mapping中有該字的即為該法院；此處順序有差
        var mappings = [
            { keyword: "", mapping: { ///< 單憑一字即可辨認是何法院的
                TPP:"懲", IPC:"智", KSY:"少",
                SLD:"士", PCD:"板", ILD:"宜", KLD:"基",
                TYD:"桃", SCD:"竹", MLD:"苗",
                CHD:"彰", NTD:"投",
                ULD:"雲", CYD:"嘉",
                PTD:"屏", PHD:"澎", LCD:"連"
            }},
            { keyword: "地", mapping: { ///< 該地區有其他類法院的
                PCD:"新", ///< 是新北，因為「新竹」比對過了
                TPD:"北", ///< 是臺北，因為「新北」比對過了
                TCD:"中",
                TND:"南", ///< 是臺南，因為「南投」比對過了
                KSD:"雄", HLD:"花", TTD:"東", KMD:"金"
            }},
            { keyword: "行", mapping: { ///< 行政法院只有四間
                TPA:"最", TPB:"北", TCB:"中", KSB:"雄"
            }},
            { keyword: "分", mapping: { ///< 高等法院分院有五間
                TCH:"中", TNH:"南", KSH:"雄", HLH:"花", KMH:"金"
            }},
            { keyword: "", mapping: { ///< 最後剩下的
                TPD:"北", KSD:"雄", ///< 「北院」、「雄檢」這些兩個字的
                TPS:"最", TPH:"高"  ///< 普通法院體系，因為行政法院都比對過了
            }}
        ];
        var replace = function(match, inSpecial) {
            var courtName = match[0].replace(/\s+/g, '').replace(/台/g, '臺');
            var isProsecution = courtName.indexOf("檢") > 0;
            var courtID;
            for(var i = 0; i < mappings.length; ++i) {
                var m = mappings[i];
                if(courtName.indexOf(m.keyword) == -1) continue;
                for(var c in m.mapping)
                    if(courtName.indexOf(m.mapping[c]) != -1) {
                        courtID = c;
                        break;
                    }
                if(courtID) break;
            }
            if(courtID) lastFoundCourt = courtID;
            var node;
            if(inSpecial != 'A' && courtID) {
                node = document.createElement("A");
                node.setAttribute('target', '_blank');
                if(!isProsecution) 
                    node.setAttribute('href', "http://" + courtID + ".judicial.gov.tw");
                else {
                    var prosecuteID;
                    switch(courtID) {
                    case "PCD": prosecuteID = "pcc"; break;
                    case "IPC": prosecuteID = "thip"; break;
                    default: prosecuteID = courtID.toLowerCase();
                    }
                    node.setAttribute('href', "http://www." + prosecuteID + ".moj.gov.tw");
                }
            }
            else node = document.createElement("SPAN");
            node.setAttribute("title", courtID
                ? courts[courtID] + (isProsecution ? "檢察署" : "")
                : courtName + "\n（沒有這個法院吧？）"
            );
            node.className = "LER-court";
            node.appendChild(document.createTextNode(match[0]));
            return node;
        }
        return {pattern: pattern, replace: replace, minLength: 4}; ///< 最短的是「最高法院」
    }());

    /** 裁判字號
      * 搭配`jirs.js`，可連向裁判書系統並送出表單，
      * 不過如果連結有兩個以上，還是得自己點
      */
    rules.push(function() {
        var pattern = "(%number%)(年度?)?(\\W{1,10})字\\s*第?(%number%)號((刑事|民事|行政)?(確定|終局|，?(中華民國)?\\d+年\\d+月\\d+日第.審)*(裁定|判決))";
        pattern = pattern.replace(/%number%/g, '[\\d零０一二三四五六七八九十百千]+');
        pattern = new RegExp(pattern, 'g');
        var replace = function(match, inSpecial) {
            var year = parseInt(match[1]);
            var num = parseInt(match[4]);

            var text = year + "年" + match[3] + "字" + num + "號" + match[5];
            var title = match[0];

            var node;
            if(lastFoundCourt) {
                title = courts[lastFoundCourt] + "\n" + title;
                if(inSpecial != 'A') {
                    node = document.createElement("A");
                    node.setAttribute("target", "_blank");
                    var sys = match[6]
                        ? ({"刑事":"M", "民事":"V", "行政":"A", "公懲":"P"})[match[6]]
                        : (/行政/.test(courts[lastFoundCourt]) ? "A" : "M")
                    ;
                    var href = "http://jirs.judicial.gov.tw/FJUD/FJUDQRY01_1.aspx";
                    href += "?v_court=" + lastFoundCourt;
                    href += "&v_sys=" + sys;
                    href += "&jud_year=" + year;
                    href += "&jud_case=" + encodeURI(match[3]);
                    href += "&jud_no=" + num;
                    node.setAttribute('href', href);
                }
            }
            if(!node) node = document.createElement("SPAN");
            node.className = "LER-trialNum";
            node.setAttribute('title', title);
            node.appendChild(document.createTextNode(text));
            return node;
        }
        return {pattern: pattern, replace: replace, minLength: 8}; ///< 最短的是「99訴字1號裁定」
    }());

    rules.push(function() {
        var pattern = /((中華)?民國)?\s*([零０一二三四五六七八九十百]+|\d+)\s*年\s*([一二三四五六七八九十]+|\d+)\s*月\s*([一二三四五六七八九十]+|\d+)\s*日/g;
        var replace = function(match) {
            var node = document.createElement("SPAN");
            node.className = "LER-date";
            node.setAttribute("title", match[0]);
            node.innerText = parseInt(match[3]) + "." + parseInt(match[4]) + "." + parseInt(match[5]);
            return node;
        };
        return {pattern: pattern, replace: replace, minLength: 8}; ///< 最短的是「民國一年一月一日」
    }());

    return {
        parse: function() {
            this.counter = 0;
            parseElement.apply(this, arguments);
            debug(counter + " has been rendered");
        },
        addIFrame: addIFrame,
        setDefaultLaw: setDefaultLaw,
        autoParse: document.body,
        showJYI: function(num) {
            debug(num);
        },
        setAutoParse: function(node) {this.autoParse = node;},
        debug: function(varName) {return eval(varName);},
        debugTime: function(str) {debug(str);}
    };
}();
LER.debugTime("initialization");