// find all mention of author using the command line `:/`
// cycle through the results using `n` (think next) and `shift n` (previous)
// then remove the highlighting using `:noh`

'use strict';

var utility = require('../utility'),
    config = require('../config'),
    experience = require('../experience_manager'),
    VideoView = require('./video'),
    FullScreenImgView = require('./fullscreen_img'),
    CarouselView = require('./carousel'),
    InlineEmailCardView = require('./inline_email_card');

module.exports = Card;

function Card(model) {
  var $el = this.$el = $m(document.createElement('li')).addClass('feedItem umc'),
      commentCollapsedPosition;

  this.model = model;

  this.pathname = model.path;

  function updateCommentCollapsedPosition() {
    commentCollapsedPosition = $el.find('.toggleComments').offset().top - 200;
  }

  function scrollToCommentCollapsedPosition() {
    utility.scrollTo(commentCollapsedPosition);
  }

  _.bindAll(this, 'render', 'remove', 'toggleArticle');
  $el
    .on('touchmove', _.bind(closenomobilemsg, this))
    .on('click', '.openerimage.article, h2, .togglearticle, .toggleArticleBuffer', this.toggleArticle)
    .on('click', '.sharecardfacebook', _.bind(sharecardonfacebook, this))
    .on('click', '.socialbutton', preventdefault)
    .on('click', '.contributor', this.togglearticle)
    .on('click', '.togglecomments', _.bind(toggledisqus, this))
    .on('click', '.nomobilenotification', togglenomobilemsg)
    .on('click', '.videoplayer', cardinteraction.call(this, 'tap to Access Video'))
    .on('click', '.iframeoverlay', _.bind(interactwithiframe, this))
    .on('click', '.category', cardinteraction.call(this, 'tap card Category'))
    .on('click', '.carouselitem', _.bind(carouselanalytics, this))
    .on('click', '.savestory', _.bind(togglesavestory, this))
    .on('click', '.expandedcontentopenslideshow', _.bind(openslideshow, this))
    .on('click', '.expandedcontentbody img', _.bind(openfullscreenImg, this))
    .on('comment-expand-start', updatecommentcollapsedposition)
    .on('comment-collapse-end', scrolltocommentcollapsedposition);


  setupSponsorValues.call(this);
  setupCategoryValues.call(this);
}

_.extend(Card.prototype, {
  initializeSaveState: function initializeSaveState() {
    var savedStories = JSON.parse(localStorage.getItem('savedStories')) || [];
    if(_.contains(savedStories, this.model.id)) {
      this.$el.find('.saveStory').addClass('saved');
    }
  },

  isIframeSafe: function isIframeSafe(str) {
    var whitelistedSources = [
      /instagram\.com/, /instagr\.am/,
      /youtube\.com/, /youtu\.be/,
      /soundcloud\.com/,
      /teamcoco\.com/,
      /mtvnservices\.com/,
      /facebook\.com/,
      /vimeo\.com/
    ];
    return !!_.find(whitelistedSources, function(regex) {
      return !!str.match(regex);
    });
  },

  toggleArticle: function toggleArticle() {
    if (this.$el.hasClass('expanded')) {
      this.collapse();
      $m.publish('card.collapse', [this]);
    } else {
      $m.publish('card.expand', [{ view: this }]);
      $m.publish('card.viewed', [this]);
      $m.publish(
        'analytics.cardEvent',
        [
          [
            '_trackEvent', 'Mobile Navigation Events',
            'Card_CTA',  'Expand Card'
          ], this.model
        ]
      );
      experience.increment('_m_decayReadMoreCount');
      this.expand();
    }
  },

  render: function render() {
    var self = this,
        model = this.model,
        $el = this.$el,
        pathname = utility.getLocationPathname(),
        typeClass;

    typeClass = model.type || 'missing';

    // card type class
    $el.addClass(typeClass.toLowerCase() + 'Type');

    // Body sanitization
    if (model.body) {
      sanitizeBody.call(self);
    }

    renderHTML.call(this);

    // Prepare carousel if necessary
    $el.find('.carousel').each(function() {
      var carouselModel = model.slideshow(),
          startingSlide, carouselView;

      startingSlide = determineStartingSlide.call(self);

      carouselView = new CarouselView(carouselModel, {
        $el: $m(this),
        startingSlide: startingSlide,
        cardModel: self.model
      });
      carouselView.render();
      self.carouselView = carouselView;
    });

    // Prepare video player if necessary
    $el.find('.videoPlayer').each(function() {
      (new VideoView({
        videoId: model.video,
        img: model.openerImageUrl
      }, {
        $el: $m(this)
      })).render();
    });

    // Expand card on direct link
    if (pathname === model.path || pathname === '/' + model.id) {
      setAsDeepLink.call(this);
    }

    self.initializeSaveState();

    return self;
  },

  collapse: function collapse(options) {
    var $el = this.$el,
        cardPosition, pagePosition, oldScrollTop, oldHeight, newHeight;

    if(!$el.hasClass('expanded')){ return; }

    $el.find('.iframeOverlay').off().remove();

    $el.find('.expandedContentBody iframe[src]').each(function() {
      var $iframe = $m(this),
          src = $iframe.attr('src');

      utility.changeIframeSrc($iframe, 'about:blank');
      $iframe.attr('data-src', src).off();
    });

    options = options || {};

    cardPosition = $el.position().top;
    pagePosition = $m(document.body).scrollTop();
    oldScrollTop = $m(global.window).scrollTop();
    oldHeight = $el.height();

    $el.removeClass('expanded');
    newHeight = $el.height();

    collapseComments.call(this);

    if(options.automatic && cardPosition < pagePosition) {
      utility.scrollTo(oldScrollTop + newHeight - oldHeight);
    }
    resetToggleButtonPosition.call(this);
  },

  expand: function expand() {
    this.$el.addClass('expanded');
    this.loadExternalResources();

    utility.resizeInstagramIframes(this.$el);

    if (!config.isSticky) {
      this.alignToggleButton();
    }
  },

  loadExternalResources: function loadExternalResources() {
    var self = this;
    this.$el.find(
      '.expandedContentBody iframe[data-src]'
    ).each(function() {
      var $iframe = $m(this),
          src = $iframe.attr('data-src');

      $iframe.width('100%');
      utility.changeIframeSrc($iframe, src);

      if (self.isIframeSafe(src)) { return; }

      $iframe.on('load', function() {
        var $iframeOverlay = $m(
          document.createElement('div')
        ).addClass('iframeOverlay'),
        $startExplore = $m(
          document.createElement('div')
        ).text('Explore').addClass('startExplore');

        $iframeOverlay.append($startExplore).insertBefore(this);
        $iframeOverlay.height($m(this).height() + 'px');
        $iframeOverlay.width('100%');
      });
    });

    this.$el.find('img[data-src]').each(function() {
      var $img = $m(this),
          src = $img.attr('data-src');
      $img.removeAttr('data-src').attr('src', src);
    });
  },

  alignToggleButton: function alignToggleButton() {
    var $window, viewportHeight, scrollTop, viewportBottom, cardBottom,
        toggleOffset, contentTop, contentBottom, $toggleBtnContainer;

    fastdom.read(_.bind(function() {
      $window = $m(global.window);
      $toggleBtnContainer = this.$el.find('.toggleBtnContainer');
      viewportHeight = $window.height();
      scrollTop = $window.scrollTop();
      viewportBottom = scrollTop + viewportHeight;
      cardBottom = this.$el.offset().top + this.$el.height();
      contentTop = $toggleBtnContainer.offset().top + 40;
      contentBottom = contentTop + $toggleBtnContainer.height();
    }, this));

    fastdom.write(_.bind(function() {
      if (contentBottom < viewportBottom || contentTop > viewportBottom) {
        resetToggleButtonPosition.call(this);
      } else {
        toggleOffset = cardBottom - viewportBottom + 'px';
        this.$el.find('.toggleArticle')
                .css({bottom: toggleOffset})
                .addClass('noSticky');
      }
    }, this));
  },

  remove: function remove() {
    this.$el.off().remove();
  },

  getId: function getId() {
    return this.model.id;
  }
});

function cardInteraction(message) {
  return _.bind(function() {
    $m.publish('analytics.cardEvent', [['_trackEvent', 'Mobile Navigation Events', 'Card_CTA', message], this.model]);
    $m.publish('card.viewed', [this]);
  }, this);
}

function sanitizeBody() {
  /* jshint multistr: true */
  var $body = $m(document.createElement('div')).append(this.model.body);
  $body.find("img, iframe").each(function() {
    $m(this).attr("data-src", $m(this).attr("src"));
    $m(this).removeAttr("src");
  });
  $body
    .find("nomobile[data-hidden='true']").remove();
  $body
    .find("nomobile, object, embed")
    .replaceWith("<div class='noMobileNotification'> \
               <figcaption class='noMobileMsg'> \
               <p>Bad news! This content will only work on your desktop. But, we promise it's worth checking out...</p> \
               </figcation> \
               </div>");
  this.model.body = $body.html();
}

function resetToggleButtonPosition() {
  if(!config.isSticky) {
    this.$el.find('.toggleArticle')
            .css({bottom: 0})
            .removeClass('noSticky');
  }
}

function setAsDeepLink() {
  var self = this,
      $el = this.$el;

  if (experience.showEmailCard()) {
    displayEmailCardInline.call(self);
  }

  global.app.analytics.currentCard = self.model;
  $el.addClass('expanded');
  $m.publish('card.expandOnLoad', [
    {
      pos: $m(global.window).height() * 0.75,
      view: self
    }
  ]);
  $m.publish('card.viewed', [self]);
  self.loadExternalResources();
  _.defer(function() {
    if (self) {
      utility.resizeInstagramIframes($el);
    }
  });
}

function displayEmailCardInline() {
  var self = this,
      $el = self.$el,
      inlineEmailCard = new InlineEmailCardView(),
      br,
      node;

  inlineEmailCard.render();

  node = _.find($el.find(".expandedContentBody").contents(), function(el) {
    var textContent = el.textContent.trim(),
        excerpt = self.model.excerpt,
        maxBound = 50,
        bound = Math.min(textContent.length, excerpt.length, maxBound);
    return (
      textContent.length &&
      el.nodeType === Node.TEXT_NODE &&
      excerpt.slice(0, bound) === textContent.slice(0, bound)
    );
  });
  br = $m(node).nextAll('br:first');

  br.after(inlineEmailCard.$el);
}

function openSlideshow() {
  var evtArray = [[
    '_trackEvent', 'Mobile Navigation Events', 'Card_CTA',
    'Tap to Start Slideshow via expanded'
  ], this.model];
  this.carouselView.openSlideshow();
  $m.publish('analytics.enterSlideshow', evtArray);
}

function determineStartingSlide() {
  var slideParam;

  if (this.model.path === global.location.pathname) {
    slideParam = ((/slide-(\d+)/g).exec(utility.getLocationHash()));
    if (slideParam && slideParam.length === 2) {
      return parseInt(slideParam[1], 10) - 1;
    }
  }
  return 0;
}

function shareCardOnFacebook(e) {
  var fromExpanded = $m(e.target).hasClass('expandedContentFacebookButton'),
      mkArray = function(actionType) {
        return [
          '_trackSocial', 'Facebook', actionType,
          model.canonical, utility.getLocationHref()
        ];
      },
      clickAction = fromExpanded? 'Share via Expanded' : 'Share via Feed',
      successAction = fromExpanded? 'Completed Share via Expanded': 'Completed Share via Feed',
      model = this.model;

  global.FB.ui({
    method: "feed",
    name: model.title,
    link: model.canonical,
    description: model.sanitizedExcerpt,
    picture: "http:" + model.openerImageUrl,
    caption: "Refinery29 &mdash; " + model.primary_category
  }, function(response) {
    if (response && response.post_id) {
      $m.publish('analytics.cardEvent', [mkArray(successAction)]);
    }
  });
  $m.publish('analytics.cardEvent', [mkArray(clickAction), model]);
  $m.publish("card.viewed", [this]);
}

function preventDefault(e) {
  e.preventDefault();
}

function toggleDisqus() {
  var $disqusThread = $m('#disqus_thread'),
      $toggleComments = this.$el.find('.toggleComments'),
      self = this;

  if ($toggleComments.hasClass('collapsed')) {
    this.$el.trigger('comment-expand-start');
    $disqusThread.removeClass('hidden').appendTo(this.$el.find('.disqus'));
    $toggleComments.removeClass('collapsed');
    global.DISQUS.reset({
      reload: true,
      config: function() {
        this.page.url = self.model.disqus_url;
      }
    });

    $m.publish(
      'analytics.cardEvent', [
        [
          "_trackEvent", "Mobile Navigation Events",
          "Card_CTA", "See Comments"
        ]
      ]
    );
  } else {
    collapseComments.call(this);
    this.$el.trigger('comment-collapse-end');
  }
}

function collapseComments() {
  this.$el.find('#disqus_thread').addClass('hidden');
  this.$el.find('.toggleComments').addClass('collapsed');
}

function linkToContributor() {
  $m.publish(
    'analytics.outbound', [
      ['_trackEvent', 'Mobile Navigation Events', 'Card_CTA', 'See Author'],
      this.model.contributors.all[0].path,
      this.model
    ]
  );
}

function setupSponsorValues() {
  if(this.model.isSponsored()) {
    this.$el.attr('data-sponsor', this.model.ad_info.sponsor_name);
  }
}

function setupCategoryValues() {
  this.$el.attr('data-cat', this.model.getParentCategory())
          .attr('data-subcat', this.model.getChildCategory());
}

function toggleNoMobileMsg(e) {
  $m(e.target).toggleClass('selected');
}

function closeNoMobileMsg(e) {
  if($m(e.target).hasClass('noMobileNotification')) {
    return;
  }
  this.$el.find('.noMobileNotification').removeClass('selected');
}

function carouselAnalytics() {
  $m.publish(
    'analytics.enterSlideshow',
    [
      [
        '_trackEvent', 'Mobile Navigation Events',
        'Carousel', 'Tap to Start Slideshow'
      ], this.model
    ]
  );
  $m.publish('card.viewed', [this]);
}

function openFullscreenImg(event) {
  (new FullScreenImgView({
    src: $m(event.target).attr('src'),
    credit: $m(event.target).siblings('.asset-credit').first().text(),
    caption: null,
    products: [],
    cardModel: this.model
  })).render();
}

function toggleSaveStory(event) {
  var model = this.model,
      savedStories = JSON.parse(
        global.localStorage.getItem('savedStories')
      ) || [],
      publishToggleSaveEvt = function(msg) {
        var evtArray = [
          '_trackEvent',
          'Mobile Navigation Events',
          'Card_CTA',
          msg
        ];
        $m.publish('analytics.cardEvent', [evtArray, model]);
      },
      $saveStory = this.$el.find('.saveStory');

  if (_.contains(savedStories, model.id)) {
    $saveStory.removeClass('saved');
    savedStories.splice(savedStories.indexOf(model.id), 1);
    publishToggleSaveEvt('Tap to Unsave Story');
  } else {
    $saveStory.addClass('saved');
    savedStories.push(model.id);
    publishToggleSaveEvt('Tap to Save Story');
  }
  utility.localStorageSetItem('savedStories', JSON.stringify(savedStories));
  $m.publish('card.saveStory', [$m(event.target).hasClass('saved')]);
}

function interactWithIframe(event) {
  cardInteraction.call(this, 'Tap to Explore')();
  $m(event.target).off().remove();
}

function renderHTML() {
  var cardHTML, slHTML;

  this.$el.empty();

  if (this.model.needsSponsoredLogo()) {
    slHTML = app.template('card_sponsored_logo')({
      gptId: 'div-gpt-sl-' + Date.now(),
      sponsorName: this.model.ad_info.sponsor_name
    });
    this.$el.addClass('feedItem-sponsored').append(slHTML);
  }
  if (this.model.type === 'author') {
    cardHTML = app.template('author_card')({
      card: this.model,
      headShotUrl: utility.getResizedUrl(this.model.portrait, '480x480')
    });
  } else {
    cardHTML = app.template('card')({ card: this.model, showReadMore: experience.showReadMore() });
  }
  this.$el.append(cardHTML);
}

