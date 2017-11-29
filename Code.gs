/*jslint
    browser, devel, maxlen: 80, white
*/
/*global
    Logger, PropertiesService, SpreadsheetApp
*/
/*property
    appendRow, ball, bonus, concat, date, drawingSpreadsheetId, end,
    estJackpot, filter, forEach, gameRulesSpreadsheetId, getActive,
    getDataRange, getDate, getDisplayValues, getFullYear, getMonth,
    getProperties, getScriptProperties, getSheetByName, getSheetName,
    getSheets, getTime, jackpot, keys, length, map, match, nextDate, numArr,
    openById, playsSpreadsheetId, price, reduce, replace, rulesMap, setHours,
    setMilliseconds, setMinutes, setSeconds, slice, some, sort, split, start,
    threshold, toLowerCase, toString
*/

// TODO: fix jsdoc comments
// TODO: work on JS Module Patterns

//********************************* Utilities **********************************

function getTodayDate() {
  "use strict";
  var today = new Date();
  today.setHours(0);
  today.setMinutes(0);
  today.setSeconds(0);
  today.setMilliseconds(0);
  return today;
}

function dollarsToNum(dollars) {
  "use strict";
  if (typeof dollars === "number") {
    return dollars;
  }
  if (dollars.match(/^\$\d+(,\d{3})*(\.\d+)?$/)) {
    return Number(
      dollars.match(/\d+(,\d{3})*(\.\d+)?$/)[0]
      .replace(/,/g, "")
    );
  }
  return undefined;
}

//**************************** Process Game Rules ******************************

/**
* Returns game payouts indexed by ball match patterns.
* @example
* // returns {"31":"$1,000","11":"$100"}
* rulesArrToObj([["match","31","$1,000"],["match,"11","$100"]);
*
* @param {object} rulesArr - 2d array of ball match patterns with payouts.
* @returns {object} an object composed of payouts indexed by match patterns.
*/
function rulesArrToObj(rulesArr) {
  "use strict";
  return rulesArr.filter(
    function (curVal) {
      return curVal[0] === "match";
    }).reduce(
    function (obj, arr) {
      // arr == ["match", pattern, payout]
      // obj == {{pattern: payout}, ... }
      var nam = "";
      var val = "";
      if (arr[1].length === 1) {
        nam = "0" + arr[1];
      } else {
        nam = arr[1];
      }
      if (arr[2] === "JACKPOT") {
        val = arr[2].toLowerCase();
      } else {
        val = arr[2];
      }
      obj[nam] = val;
      return obj;
    }, {});
}

/**
* Returns rules and parameters for all games played.
*
* @returns {object} {game name: {threshold, price, rules}, ... }
*/
function getGames() {
  "use strict";
  var ss = SpreadsheetApp.openById(
    PropertiesService.getScriptProperties()
    .getProperties()
    .gameRulesSpreadsheetId);
  return ss.getSheets().reduce(function (obj, sheetObj) {
    var detailsArr = sheetObj.getDataRange().getDisplayValues();
    obj[detailsArr[1][1]] = {
      threshold: detailsArr[4][1] || "$0",
      price: detailsArr[5][1],
      rulesMap: rulesArrToObj(detailsArr.slice(6))
    };
    return obj;
  }, {});
}

//**************************** Process Game Plays ******************************

/**
* Returns played numbers indexed by game name.
*
* @returns {object} {game:[{numArr,ball,bonus,startDt,endDt},...],...}
*/
function getPlays() {
  "use strict";
  var today = getTodayDate();
  var start = {};
  var end = {};
  return SpreadsheetApp.openById(
    PropertiesService.getScriptProperties()
    .getProperties()
    .playsSpreadsheetId)
  .getSheets().reduce(function (obj, sheet) {
    var playsArr = sheet.getDataRange().getDisplayValues();
    var playObjsArr = playsArr.slice(1).map(
      function (playArr) {
        start = (playArr[8]) ? new Date(playArr[8]) : today;
        end = (playArr[9]) ? new Date(playArr[9]) : today;
        return {
          numArr:playArr.slice(0,6)
          .filter(function (num) {
            return num;
          })
          .map(function (num) {
            if (num.length === 1) {
              return "0" + num;
            }
            return num;
          }),
          ball: playArr[6],
          bonus: playArr[7],
          start: start,
          end: end
        };
      });
    obj[sheet.getSheetName()] = playObjsArr;
    return obj;
  }, {});
}

//******************************* Get Kitty Data *******************************

/**
* Returns kitty entries for the last date the kitty was updated.
*
* @returns {object} [[date,game name,debit,credit], ... ]
*/
function getKittyLastArr() {
  "use strict";
  var kittyBalanceSheet = SpreadsheetApp.getActive()
  .getSheetByName("Balance Sheet");
  var kittyBalanceArr = kittyBalanceSheet.getDataRange()
  .getDisplayValues();
  var kittyLastDateStr = kittyBalanceArr.slice(-1)[0][0];
  var kittyLastDate = new Date(kittyLastDateStr);
  return kittyBalanceArr.filter(
    function (kittyRow) {
      var curDateStr = kittyRow[0];
      var curDate = new Date(curDateStr);
      return curDate.getTime() === kittyLastDate.getTime();
    });
}

//******************************************************************************

/**
* Compares entries in the kitty, for the last date the kitty was updated, with
* drawings then returns drawings that have not yet posted to the kitty.
*
* @param {object} kittyLastArr [[date,game name,debit,credit] ... ]
* @returns {object} {name: [{draw date,nums,jpt,ball,bonus,nxt dt,est jpt}],...}
*/
function getNewDrawings(kittyLastArr) {
  "use strict";
  var lastKittyDate = new Date(kittyLastArr.slice(-1)[0][0]);
  var kittyGameName = kittyLastArr.slice(-1)[0][1];
  return SpreadsheetApp.openById(
    PropertiesService
    .getScriptProperties()
    .getProperties()
    .drawingSpreadsheetId)
  .getSheets().reduce(
    function (resultObj, drawingSheet) {
      var drawGameName = drawingSheet.getSheetName();
      resultObj[drawGameName] = drawingSheet.getDataRange()
      .getDisplayValues() // [[date,nums,jpt,ball,bonus,next date,est jpt] ... ]
      .slice(1)
      .filter(
        function (drawingArr) {
          var curDate = new Date(drawingArr[0]);
          // only want drawings not already logged in the kitty
          if (curDate.getTime() > lastKittyDate.getTime()) {
            return true;
          }
          return curDate.getTime() === lastKittyDate.getTime() 
          && drawGameName !== kittyGameName;
        })
      .map(
        function (drawArr) {
          var arrObj = {};
          var date = new Date(drawArr[0]);
          var nextDate = new Date(drawArr[5]);
          arrObj.date = date;
          arrObj.numArr = drawArr[1].split("-");
          arrObj.jackpot = drawArr[2];
          arrObj.ball = drawArr[3];
          arrObj.bonus = drawArr[4];
          arrObj.nextDate = nextDate;
          arrObj.estJackpot = drawArr[6];
          return arrObj;
        });
      return resultObj;
    }, {});
}

//******************************************************************************

/**
* Get drawings for games that have active plays and have jackpots that meet
* the minimum threshold.
* @param {object} newDrawingsObj
* @param {object} playsObj
* @param {object} gamesObj
* @returns {object} {name:[{date,numArr,ball,bonus,jackpot,nextDate,
*                           estJackpot},...],...}
*/
function getActiveDraws(newDrawingsObj, playsObj, gamesObj) {
  "use strict";
  return Object.keys(newDrawingsObj).reduce(
    function (obj, keyName) {
      // array contains drawings objects for one game
      var activeDrawsArr = newDrawingsObj[keyName].filter(
        // only return drawings that have active plays
        function (drawObj) {
          // true if a play is active for the drawing
          return playsObj[keyName].some(
            function (playObj) {
              // drawing has active play
              return playObj.start.getTime() <= drawObj.date.getTime() && 
                drawObj.date.getTime() <= playObj.end.getTime();
            });
        })
      .filter(
        // only return drawings whose jackpot meets minimum threshold
        function (drawObj) {
          if (gamesObj[keyName].threshold === ""
              || gamesObj[keyName].threshold === null
              || gamesObj[keyName].threshold === undefined) {
            return true;
          }
          return drawObj.jackpot >= gamesObj[keyName].threshold;
        });
      if (activeDrawsArr.length >0) {
        obj[keyName] = activeDrawsArr;
      }
      return obj;
    }, {});
}

//******************************************************************************

/**
* @param {object} activeDrawsObj - {name:[{date,numArr,ball,bonus,jackpot,
*                                          nextDate,estJackpot},...],...}
* @param {object} gamesObj - {name: {threshold, price, rules},...}
* @param {object} playsObj - {name: [{numArr,ball,bonus,start,end},...]}
* @returns {object} - [[date.getTime(),gameName,winnings],...]
*/
function getWins(activeDrawsObj, gamesObj, playsObj) {
  "use strict";
  
  // return array [[date,gameName,winnings,...]
  return Object.keys(activeDrawsObj).reduce(
    
    function (result, gameName) {
      var newVal = activeDrawsObj[gameName].map(

        function (drawObj) {
          var noOfPlays = 0;  // number of active plays for one drawing
          var winnings = playsObj[gameName]
          .filter(
            
            function (playObj) {
              // active plays
              return playObj.start.getTime() <= drawObj.date.getTime()
              && drawObj.date.getTime() <= playObj.end.getTime(); 
            })
          .reduce(
            
            function (total, activePlayObj, index) {
              var wins = 0;
              var matches = activePlayObj.numArr.reduce(
                
                function (total, playedNum) {
                  var matchTemp = drawObj.numArr.filter(
                    function (drawnNum) {
                      return drawnNum === playedNum;
                    }).length;
                  return total + matchTemp;
                }, 0).toString();
              noOfPlays = index + 1;  // number of plays for this drawing
              var ball = "";
              var bonus = 1;
              var match = "";
              
              if (activePlayObj.ball !== ""
                  && activePlayObj.ball !== null
                  && activePlayObj.ball !== undefined) {
                ball = (activePlayObj.ball === drawObj.ball) ? "1" : "0";
                match = matches + ball;
              } else {
                match = "0" + matches;
              }
              wins = gamesObj[gameName].rulesMap[match] || "$0";
              if (activePlayObj.bonus !== ""
                  && activePlayObj.bonus !== null
                  && activePlayObj.bonus !== undefined
                  && wins !== "jackpot") {
                if (activePlayObj.bonus === drawObj.bonus) {
                  bonus = activePlayObj.bonus;
                }
              }
              if (wins === "jackpot") {
                wins = dollarsToNum(drawObj.jackpot);
              } else {
                wins = dollarsToNum(wins);
              }
              // total
              return total + (wins * bonus);
            }, 0);
          
          return [drawObj.date.getTime(), gameName, winnings, noOfPlays];
        });
      
      // return array [[date.getTime(),gameName,winnings],...]
      return result.concat(newVal);
    }, []).sort();
}

//******************************************************************************

function updateKitty(wins, gamesObj) {
  "use strict";
  var kittySsObj = SpreadsheetApp.getActive();
  wins.forEach(
    function (win) {
      var plays = win[3];
      var date = new Date(win[0]);
      var month = date.getMonth() + 1;
      var dateStr = month.toString()
      + "/" 
      + date.getDate() 
      + "/" + date.getFullYear();
      var rowContents = [
        dateStr,
        win[1],
        dollarsToNum(win[2]),
        dollarsToNum(gamesObj[win[1]].price) * plays
        ];
      kittySsObj.getSheetByName("Balance Sheet").appendRow(rowContents);
    });
}

//******************************************************************************

/** Sunk Cost Kitty - calculates, stores, and sends results. */
function main() {
  "use strict";
  
  // 1. Get last row of kitty data.
  var kittyLastArr = getKittyLastArr(); // [[dt,name,deb,cred]...]
  
  // 2. Check for new results from last kitty update up to the latest draw date.
  //    Input: [[dt,name,deb,cred]...]
  //    Output: {name:[{date,numArr,jackpot,ball,bonus,nextDate,estJackpot},...
  //                  ],...
  //            }
  var newDrawingsObj = getNewDrawings(kittyLastArr);
  
  // 3. check for wins, send emails (alerts, wins)  
  var gamesObj = getGames(); // {name: {threshold, price, rules},...}
  var playsObj = getPlays(); // {name: [{numArr,ball,bonus,start,end},...]}
  
  // 3.1 update kitty
  
  // Output: {name:[{date,numArr,ball,bonus,jackpot,nextDate,
  //                 estJackpot},...],...}
  var activeDrawsObj = getActiveDraws(newDrawingsObj, playsObj, gamesObj);
  
  // Output: [[date.getTime(),gameName,winnings,#of plays],...]
  var wins = getWins(activeDrawsObj, gamesObj, playsObj);
  updateKitty(wins, gamesObj);
  
  // 3.2 send email for newly active games
  
  // if active--new--result (threshold met, dates of play in range, and new) 
  // then:  calc, file, email results.
  
  // 1. game must have entry in Game rules
  // 2. play must meet minimum threshold
  // 3. play must be active for drawing date
  // 4. result must be "new" (i.e., not already filed to kitty ss)
  
  // if inactive but next jackpot above threshold, send advisory email.
}

//******************************************************************************