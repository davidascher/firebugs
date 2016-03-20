var Firebase = require('firebase');
var ref = new Firebase('https://firebugs.firebaseIO.com/');
var request = require('request')
var compress = require('compression');
var logger = require('morgan');
var bodyParser = require('body-parser');
var async = require('async');
var parselh = require('parse-link-header');

var expressValidator = require('express-validator');
var cookieParser = require('cookie-parser');
var flash = require('express-flash');
var habitat = require('habitat');
habitat.load('.env');

var sessions = require('client-sessions');
var secrets = require('./config/secrets'); // why are we using this and habitat? XXX TODO

// the token is a thing we use to get a lot of data from github.  It is associated with my personal account (not the user's)

var token = secrets.github.token;
// console.log(secrets);

function parseOrg(token, org, callback) {
  var encodedOrg = encodeURIComponent(org);
  ref.child('orgs').child(encodedOrg).set(
    {'date': String(new Date()),
     'url': "https://github.com/" + org});

  //  GET /orgs/:org/repos
  var url = "https://api.github.com/orgs/" + org + '/repos';
  url += "?access_token="+encodeURIComponent(token);
  var options = {
    url: url,
    json: true,
    headers: {
        'User-Agent': 'NodeJS HTTP Client'
    }
  };
  request.get(options, function(err, ret) {
    var repos = ret.body;
    async.forEachOf(repos, function(repo, key, cb) {
      parseRepo(token, org, repo.name, cb);
    }, function() {
      console.log("DONE PARSING ORG", org);
      callback();
    });
  });
}

function processIssues(issues, encodedRepo, callback) {
  console.log('# of issues:', issues.length)
  async.forEachOf(issues, function(issue, key, cb) {
    // console.log('    adding issue', org+'/'+repo+'/'+issue.number)
    issue.numComments = issue.comments;
    delete issue.comments;
    issuesRef.child(encodedRepo).child(issue.number).set(issue);
    cb();
  }, function(err) {
    if (err) {console.log(err);}
  });

}

function getPageOfIssues(url, encodedRepo, callback) {
  var options = {
    url: url,
    json: true,
    headers: {
        'User-Agent': 'NodeJS HTTP Client'
    }
  };
  request.get(options, function(err, ret) {
    if (err) {
      console.log(err);
    } else {
      processIssues(ret.body, encodedRepo, callback);
      if (ret.headers.link) {
        var links = parselh(ret.headers.link);
        if (links.next) {
          getPageOfIssues(links.next.url, encodedRepo, callback)
        } else {
          callback();
        }
      } else {
        callback();
      }
    }
  });
}

function parseRepo(token, org, repo, callback) {
  // first get repo info
  console.log('** parsing repo: ', org, repo);
  encoderRepo = repo.split('.').join('_dot_');
  var encodedRepo = encodeURIComponent(org+'/'+encoderRepo);
  ref.child('repos').child(encodedRepo).set(
    {'date': String(new Date()),
     'url': "https://github.com/" + org + "/" + repo});
  var url = "https://api.github.com/repos/" + org + '/' + repo;
  url += "?access_token="+encodeURIComponent(token);
  // console.log(url);
  var options = {
    url: url,
    json: true,
    headers: {
        'User-Agent': 'NodeJS HTTP Client'
    }
  };
  request.get(options, function(err, ret) {
    var repository = ret.body;
    if (! repository.url ) {
      console.log("NO URL FOR", repo);
      callback();
    } else {
      url = repository.url + '/issues'; // XXX figure out pagination if needed
      url += "?access_token="+encodeURIComponent(token);

      getPageOfIssues(url, encodedRepo, callback);
    }
  });
          //
          // url = issue.url + "/comments?access_token="+encodeURIComponent(token);
          // var options = {
          //   url: url,
          //   json: true,
          //   headers: {
          //       'User-Agent': 'NodeJS HTTP Client'
          //   }
          // };
          // function getComments(issue) {
          //   request.get(options, function(err, ret) {
          //     if (err) {
          //       console.log(err);
          //     } else {
          //       if (ret.body) {
          //         async.forEachOf(ret.body, function(comment, key, cb) {
          //           if (issue.url != comment.issue_url) {
          //             console.log("WTF", "ISSUE", issue, "\n\n\nCOMMENT", comment);
          //             process.exit(0);
          //           }
          //           issues.child(encodedRepo).child(issue.number).child('comments').child(comment.id).set(comment);
          //           cb();
          //         });
          //       }
          //       return 1;
          //     }
            // });
          // }
          // cb();
          // getComments(issue);
        // })
      // }
  //   });
  // });
}

var issuesRef = ref.child('issues');
var asks = ref.child('asks');
ref.authWithCustomToken(secrets.firebase.key, function(error, authData) {
  if (error) {
    console.log("Login Failed!", error, authData, secrets.firebase.key);
  } else {
    console.log("Authenticated successfully with firebase.");
    asks.once('value', function(snapshot) {
      if (snapshot.val() == null) {
        asks.set({});
      }
      if (process.env["PROD"]) {
        assetDirname = 'dist';
      } else {
        assetDirname = 'build';
      }
      // async.forEachOf(['Mozillafoundation', 'rust-lang'], function(org, key, cb) {
      async.forEachOf(['mozilla', 'mozilla-b2g'], function(org, key, cb) {
        console.log("PARSING", org);
        parseOrg(token, org, cb);
      }, function(done) {
        process.exit(0);
      })
    });
  }
});
