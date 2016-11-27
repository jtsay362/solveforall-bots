/*~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
           ______     ______     ______   __  __     __     ______
          /\  == \   /\  __ \   /\__  _\ /\ \/ /    /\ \   /\__  _\
          \ \  __<   \ \ \/\ \  \/_/\ \/ \ \  _"-.  \ \ \  \/_/\ \/
           \ \_____\  \ \_____\    \ \_\  \ \_\ \_\  \ \_\    \ \_\
            \/_____/   \/_____/     \/_/   \/_/\/_/   \/_/     \/_/


This is a sample Slack bot built with Botkit.

This bot demonstrates many of the core features of Botkit:

* Connect to Slack using the real time API
* Receive messages based on "spoken" patterns
* Reply to messages
* Use the conversation system to ask questions
* Use the built in storage system to store and retrieve information
  for a user.

# RUN THE BOT:

  Get a Bot token from Slack:

    -> http://my.slack.com/services/new/bot

  Run your bot from the command line:

    token=<MY TOKEN> node slack_bot.js

  Make sure to invite your bot into other channels using /invite @<my bot>!

# EXTEND THE BOT:

  Botkit has many features for building cool and useful bots!

  Read all about it here:

    -> http://howdy.ai/botkit

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~*/
require('es6-promise').polyfill();

const _ = require('lodash');
const URI = require('urijs');
const sanitizeHtml = require('sanitize-html');

const SLACK_API_TOKEN = process.env['SLACK_API_TOKEN'];
if (!SLACK_API_TOKEN) {
    console.log('Error: Specify token in environment');
    process.exit(1);
}

const BASE_SEARCH_URL = 'https://solveforall-search-or-solve-v1.p.mashape.com/service/content_for_text.do';
const MASHAPE_API_KEY = process.env['MASHAPE_API_KEY'];
const REQUEST_TIMEOUT_MILLIS = 30000;
const MAX_ATTACHMENTS_PER_REPLY = 20;

const ATTACHMENT_COLORS = [
  'good',
  'warning',
  'danger',
  '#439FE0'
];

const Botkit = require('botkit');
const os = require('os');
const axios = require('axios');
const logLevel = parseInt(process.env['LOG_LEVEL'] || '5');

const controller = Botkit.slackbot({
   logLevel
});

const bot = controller.spawn({
  token: SLACK_API_TOKEN
}).startRTM();

const HTML_REPLACEMENTS = {
  '&' : '&amp;',
  '<' : '&lt;',
  '>' : '&gt;'
};

function slackEscape(s) {
  return (s || '').replace(/[&<>]/g, function (m) {
    return HTML_REPLACEMENTS[m];
  });
}

function htmlToSlackFormat(html) {
  if (!html) {
    return '';
  }

  return sanitizeHtml(html.replace(/<\/?(strong|b)>/g, '*').
    replace(/<\/?(em|i)>/g, '_').
    replace(/&nbsp;/g, ' ').
    replace(/<\/?(br|p)\/?>/g, '\n').
    replace(/<a\s+[^>]*href\s*=\s*["']([^"']+)["'].*?<\/a\s*>/g, function (m, url) {
      return url;
    }), {
      allowedTags: ['img']
    });
}

controller.hears(['hello', 'hi'], 'direct_message,direct_mention,mention', function(bot, message) {

    bot.api.reactions.add({
        timestamp: message.ts,
        channel: message.channel,
        name: 'robot_face',
    }, function(err, res) {
        if (err) {
            bot.botkit.log('Failed to add emoji reaction :(', err);
        }
    });


    controller.storage.users.get(message.user, function(err, user) {
        if (user && user.name) {
            bot.reply(message, 'Hello ' + user.name + '!!');
        } else {
            bot.reply(message, 'Hello.');
        }
    });
});

controller.hears(['call me (.*)', 'my name is (.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
    var name = message.match[1];
    controller.storage.users.get(message.user, function(err, user) {
        if (!user) {
            user = {
                id: message.user,
            };
        }
        user.name = name;
        controller.storage.users.save(user, function(err, id) {
            bot.reply(message, 'Got it. I will call you ' + user.name + ' from now on.');
        });
    });
});

controller.hears(['what is my name', 'who am i'], 'direct_message,direct_mention,mention', function(bot, message) {

    controller.storage.users.get(message.user, function(err, user) {
        if (user && user.name) {
            bot.reply(message, 'Your name is ' + user.name);
        } else {
            bot.startConversation(message, function(err, convo) {
                if (!err) {
                    convo.say('I do not know your name yet!');
                    convo.ask('What should I call you?', function(response, convo) {
                        convo.ask('You want me to call you `' + response.text + '`?', [
                            {
                                pattern: 'yes',
                                callback: function(response, convo) {
                                    // since no further messages are queued after this,
                                    // the conversation will end naturally with status == 'completed'
                                    convo.next();
                                }
                            },
                            {
                                pattern: 'no',
                                callback: function(response, convo) {
                                    // stop the conversation. this will cause it to end with status == 'stopped'
                                    convo.stop();
                                }
                            },
                            {
                                default: true,
                                callback: function(response, convo) {
                                    convo.repeat();
                                    convo.next();
                                }
                            }
                        ]);

                        convo.next();

                    }, {'key': 'nickname'}); // store the results in a field called nickname

                    convo.on('end', function(convo) {
                        if (convo.status == 'completed') {
                            bot.reply(message, 'OK! I will update my dossier...');

                            controller.storage.users.get(message.user, function(err, user) {
                                if (!user) {
                                    user = {
                                        id: message.user,
                                    };
                                }
                                user.name = convo.extractResponse('nickname');
                                controller.storage.users.save(user, function(err, id) {
                                    bot.reply(message, 'Got it. I will call you ' + user.name + ' from now on.');
                                });
                            });



                        } else {
                            // this happens if the conversation ended prematurely for some reason
                            bot.reply(message, 'OK, nevermind!');
                        }
                    });
                }
            });
        }
    });
});


controller.hears(['shutdown'], 'direct_message,direct_mention,mention', function(bot, message) {

    bot.startConversation(message, function(err, convo) {

        convo.ask('Are you sure you want me to shutdown?', [
            {
                pattern: bot.utterances.yes,
                callback: function(response, convo) {
                    convo.say('Bye!');
                    convo.next();
                    setTimeout(function() {
                        process.exit();
                    }, 3000);
                }
            },
        {
            pattern: bot.utterances.no,
            default: true,
            callback: function(response, convo) {
                convo.say('*Phew!*');
                convo.next();
            }
        }
        ]);
    });
});


controller.hears(['uptime', 'identify yourself', 'who are you', 'what is your name'],
    'direct_message,direct_mention,mention', function(bot, message) {

        var hostname = os.hostname();
        var uptime = formatUptime(process.uptime());

        bot.reply(message,
            ':robot_face: I am a bot named <@' + bot.identity.name +
             '>. I have been running for ' + uptime + ' on ' + hostname + '.');

    });

function formatUptime(uptime) {
    var unit = 'second';
    if (uptime > 60) {
        uptime = uptime / 60;
        unit = 'minute';
    }
    if (uptime > 60) {
        uptime = uptime / 60;
        unit = 'hour';
    }
    if (uptime != 1) {
        unit = unit + 's';
    }

    uptime = uptime + ' ' + unit;
    return uptime;
}

function makeSearchRequest(q, options) {
  const params = {
    q
    /*,
    deep: true */
  };

  const axiosOptions = {
    params,
    timeout: REQUEST_TIMEOUT_MILLIS,
    headers: {
      'Accept': 'application/json',
      'X-Mashape-Key' : MASHAPE_API_KEY
    }
  };

  return axios.get(BASE_SEARCH_URL, axiosOptions);
}


function makeQuickLinksText(quickLinks) {
  if (quickLinks.length === 0) {
    return '';
  }

  let s = 'Quick Link';
  if (quickLinks.length > 1) {
    s += 's';
  }

  s += ':\n';

  quickLinks.forEach(r => {
    const {
      context,
      result
    } = r;

    s += slackEscape(result.label) + ' ' +
      result.uri + '\n'
  });

  return s;
}


function translateSearchResponse(response, q) {
  const { data } = response;
  const {
    results
  } = data;

  const numResults = results.length;
  if (numResults === 0) {
    return {
      text: "Sorry, I couldn't find anything for you. Please try another query."
    };
  }

  let s = `I found ${numResults} result`;

  if (numResults > 1) {
    s += 's';
  }

  s += ':\n';

  let attachmentCount = 0;
  const attachments = [];

  let quickLinks = [];

  results.forEach(r => {
    const {
      context,
      result
    } = r;


    const thumbnails = result.thumbnails;
    let thumbnailUrl;
    if (thumbnails.length > 0) {
      const thumbnail = thumbnails[0];
      thumbnailUrl = thumbnail.mediaUri;
    }

    const media = result.media;
    let imageUrl;
    if (media.length > 0) {
      const m = media[0];
      imageUrl = media.mediaUri;
    }

    const isQuickLink = !thumbnailUrl && !imageUrl &&
      !result.summaryHtml && !result.content;

    if (isQuickLink) {
      quickLinks.push(r);
    } else if (attachmentCount < MAX_ATTACHMENTS_PER_REPLY) {
      let text;

      if (result.content) {
        if (result.contentType === 'text/html') {
          text = _.unescape(htmlToSlackFormat(result.content));
        } else {
          text = result.content;
        }
      } else {
        text = _.unescape(htmlToSlackFormat(result.summaryHtml));
      }

      const attachment = {
        fallback: result.label,
        //"author_name": "Bobby Tables",
        //    "author_link": "http://flickr.com/bobby/",
        //    "author_icon": "http://flickr.com/icons/bobby.jpg",
        title: result.label,
        text: slackEscape(text),
        /*
            "fields": [
                {
                    "title": "Priority",
                    "value": "High",
                    "short": false
                }
            ], */
        image_url: imageUrl,
        thumb_url: thumbnailUrl,
        mrkdwn_in: ['text', 'pretext'],
        footer: context.feedTitle || context.generatorName,
        color: ATTACHMENT_COLORS[attachmentCount % ATTACHMENT_COLORS.length]
      };

      if (result.uri) {
        attachment.title_link = result.uri;
        attachment.author_icon = result.iconUrl;
        attachment.author_name = URI(result.uri).hostname();
      }

      if (result.lastUpdatedTimestamp) {
        attachment.ts = result.lastUpdatedTimestamp / 1000;
      }

      attachments.push(attachment);
    } else {
      /*

      s += escape(result.label);
      s += "\n"; */
    }



    attachmentCount++;
  });

  s += '\n';

  if (quickLinks.length > 0) {
    s += makeQuickLinksText(quickLinks);
  }

  return {
    text: s,
    attachments
  };
}

controller.hears(["^\s*s(?:earch|olve)?\\s*(?:for\\s*)?['\"]*(.*?)['\"]*$", "^\s*([?\/>].*)"],
  'direct_message,direct_mention,mention', (bot, message) => {
  const q = message.match[1].trim();

  bot.reply(message, `Searching for '${slackEscape(q)}' ...`);

  const options = {};

  makeSearchRequest(q, options).then(response => {
    console.log('got response: ');
    console.dir(JSON.stringify(response.data));

    bot.reply(message, translateSearchResponse(response, q));

  }).catch(error => {
    if (error.response) {
      // The request was made, but the server responded with a status code
      // that falls out of the range of 2xx

      console.log('Got bad response: ' + error.response.status);
      console.log('Response body: ' + error.response.data);
      console.log('Response headers: ' + error.response.headers);
      bot.reply(message, 'I am having trouble getting a response from Solve for All. Please contact my master.');
    } else {
      // Something happened in setting up the request that triggered an Error
      console.log('Error', error.message);
      bot.reply(message, 'Doh! An internal error occurred. Please contact my master.');
    }
    console.log(error.config);
  });

  //https://solveforall.com/service/content_for_text.do?q=logitech+mouse+--e+107&client.kind=web&client.src=answers_page&type=answers&use=search&surface=true&deep=true&seq=224111174

});

controller.hears([".+"], 'direct_message,direct_mention,mention', (bot, message) => {
  bot.reply(message, "Sorry, I don't understand that command. Try prefixing your search query with *s*.");
});
