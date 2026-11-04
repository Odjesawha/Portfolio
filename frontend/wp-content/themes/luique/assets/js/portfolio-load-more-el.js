( function( $ ) {
	"use strict";

	var count = 2;
	var total = ajax_portfolio_infinite_scroll_data.max_num;

	//console.log('totalNumber: ' + total);
	var flag = 1;
	var card_wrap = $('.works-box');
	var works = $('.works-items');

	$('.works-box .load-more a').on( 'click', function(){
		if ( count > total ) {
            $(this).closest('.load-more').hide();
        } else {
        	if( flag == 1 ){
        		//console.log('pageNumber: ' + count);
            	loadContent(count);

            	if ( count + 1 > total ) {
            		$(this).closest('.load-more').fadeOut(500);
            	}
            }
        }
        if( flag == 1 ){
        	flag = 0;
        	count++;
        }

        return false;
	});

	function loadContent(pageNumber) {
		 console.log(ajax_portfolio_infinite_scroll_data);
	    $.ajax({
	        url: ajax_portfolio_infinite_scroll_data.url,
	        type:'POST',
	        data: "action=infinite_scroll_el&page_no="+ pageNumber + '&post_type=portfolio' + '&page_id=' + ajax_portfolio_infinite_scroll_data.page_id + '&order_by=' + ajax_portfolio_infinite_scroll_data.order_by + '&order=' + ajax_portfolio_infinite_scroll_data.order + '&per_page=' + ajax_portfolio_infinite_scroll_data.per_page + '&source=' + ajax_portfolio_infinite_scroll_data.source + '&temp=' + ajax_portfolio_infinite_scroll_data.temp + '&cat_ids=' + ajax_portfolio_infinite_scroll_data.cat_ids + '&ajax_nonce=' + ajax_portfolio_infinite_scroll_data.ajax_nonce,
	        success: function(html){
	        	//html = html.replace(/js-scroll-show/g, '');

            var $html = $(html);
            var $container = works;

            $html.imagesLoaded(function(){
							$container.append($html);
							$container.isotope('appended', $html );
							$container.isotope('layout');

							updateAnim();

							updateMagnificPopups();
						});

            flag = 1;
	        }
	    });
	    return false;
	}

	function updateMagnificPopups() {
	}

	function updateAnim() {
		$('.works-item.scroll-animate').scrolla({
			once: true,
			mobile: true
		});
	}

} )( jQuery );
