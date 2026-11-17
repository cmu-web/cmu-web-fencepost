<?php
/**
 * Checks the plugin in a running WordPress, with FencePost's answers mocked:
 *   wp eval-file tests/test-fencepost.php
 * It loads the plugin without installing it, makes its own posts and removes
 * everything it made when it's done.
 *
 * @package FencePost
 */

require_once dirname( __DIR__ ) . '/fencepost.php';

$GLOBALS['fencepost_failures'] = 0;
function fencepost_check( $ok, $what ) {
	if ( ! $ok ) {
		++$GLOBALS['fencepost_failures'];
	}
	echo ( $ok ? 'ok: ' : 'FAIL: ' ) . $what . "\n";
}

// FencePost's answer for the next request, and every request made
$GLOBALS['fencepost_answer']   = null;
$GLOBALS['fencepost_requests'] = array();
add_filter(
	'pre_http_request',
	function ( $pre, $args, $url ) {
		if ( ! str_contains( $url, '/api/preview' ) ) {
			return $pre;
		}
		$GLOBALS['fencepost_requests'][] = array( 'url' => $url, 'body' => json_decode( $args['body'], true ) );
		return array(
			'headers'  => array(),
			'body'     => wp_json_encode( $GLOBALS['fencepost_answer'][1] ),
			'response' => array( 'code' => $GLOBALS['fencepost_answer'][0], 'message' => '' ),
			'cookies'  => array(),
		);
	},
	10,
	3
);
function fencepost_jpeg() {
	$im = imagecreatetruecolor( 1200, 630 );
	imagefill( $im, 0, 0, imagecolorallocate( $im, 196, 18, 48 ) );
	ob_start();
	imagejpeg( $im, null, 80 );
	return ob_get_clean();
}
function fencepost_view( $post_id ) {
	$GLOBALS['wp_query']     = new WP_Query( array( 'p' => $post_id, 'post_type' => 'any' ) );
	$GLOBALS['wp_the_query'] = $GLOBALS['wp_query'];
	$GLOBALS['wp_query']->is_singular = true;
	$GLOBALS['wp_query']->queried_object    = get_post( $post_id );
	$GLOBALS['wp_query']->queried_object_id = $post_id;
}

$made = array();
$post = wp_insert_post(
	array(
		'post_title'   => 'FencePost Test Page',
		'post_name'    => 'fencepost-test-page',
		'post_type'    => 'page',
		'post_status'  => 'publish',
		'post_content' => 'A page for the plugin test.',
	)
);
$made[] = $post;

// Publishing queues one event a minute out; saving again adds no second one
$when = wp_next_scheduled( FENCEPOST_EVENT, array( $post ) );
fencepost_check( $when && $when > time() + 30, 'publishing queues a preview a minute later' );
wp_update_post( array( 'ID' => $post, 'post_content' => 'Changed.' ) );
fencepost_check( wp_next_scheduled( FENCEPOST_EVENT, array( $post ) ) === $when, 'saving again keeps the one event' );
wp_clear_scheduled_hook( FENCEPOST_EVENT, array( $post ) );

// Success: the image is saved, recorded and used
$GLOBALS['fencepost_answer'] = array( 200, array( 'image' => base64_encode( fencepost_jpeg() ), 'title' => 'T', 'description' => 'D', 'tags' => '' ) );
fencepost_make_preview( $post );
$sent  = end( $GLOBALS['fencepost_requests'] );
$image = (int) get_post_meta( $post, FENCEPOST_META_IMAGE, true );
fencepost_check( array( 'url', 'site' ) === array_keys( $sent['body'] ) && get_permalink( $post ) === $sent['body']['url'], 'sends only the address and the site name' );
fencepost_check( $image && wp_attachment_is_image( $image ), 'saves the JPEG in the media library' );
fencepost_check( 'ok' === get_post_meta( $post, FENCEPOST_META_STATUS, true ), 'records success' );
fencepost_view( $post );
$fields = apply_filters( 'fam_link_preview', array( 'image' => null ) );
fencepost_check( ( $fields['image']['url'] ?? '' ) === wp_get_attachment_url( $image ) && 1200 === $fields['image']['width'], 'feeds fam_link_preview' );

// A second success replaces the first image
fencepost_make_preview( $post );
$second = (int) get_post_meta( $post, FENCEPOST_META_IMAGE, true );
fencepost_check( $second && $second !== $image && ! get_post( $image ), 'replaces the previous image' );

// A featured image wins
$featured = wp_insert_attachment( array( 'post_mime_type' => 'image/jpeg', 'post_title' => 'Featured', 'post_status' => 'inherit' ), wp_upload_bits( 'fencepost-featured.jpg', null, fencepost_jpeg() )['file'] );
$made[]   = $featured;
set_post_thumbnail( $post, $featured );
fencepost_view( $post );
$fields = apply_filters( 'fam_link_preview', array( 'image' => 'theme' ) );
fencepost_check( 'theme' === $fields['image'], 'a featured image wins' );
delete_post_thumbnail( $post );

// 403: says why and stops
$GLOBALS['fencepost_answer'] = array( 403, array( 'error' => 'FencePost works only with Carnegie Mellon sites.' ) );
fencepost_make_preview( $post );
fencepost_check( 'failed' === get_post_meta( $post, FENCEPOST_META_STATUS, true ) && 'FencePost works only with Carnegie Mellon sites.' === get_post_meta( $post, FENCEPOST_META_MESSAGE, true ), 'a 403 records why' );
fencepost_check( ! wp_next_scheduled( FENCEPOST_EVENT, array( $post ) ), 'a 403 doesn’t retry' );

// 429: tries once more, then stops
$GLOBALS['fencepost_answer'] = array( 429, array( 'error' => 'Two captures are already running.' ) );
fencepost_make_preview( $post );
fencepost_check( 'retrying' === get_post_meta( $post, FENCEPOST_META_STATUS, true ) && wp_next_scheduled( FENCEPOST_EVENT, array( $post ) ), 'a 429 schedules a retry' );
wp_clear_scheduled_hook( FENCEPOST_EVENT, array( $post ) );
fencepost_make_preview( $post );
fencepost_check( 'failed' === get_post_meta( $post, FENCEPOST_META_STATUS, true ) && ! wp_next_scheduled( FENCEPOST_EVENT, array( $post ) ), 'a second 429 stops' );

// Off: nothing is sent or queued
update_option( 'fencepost', array( 'enabled' => false, 'address' => FENCEPOST_DEFAULT_ADDRESS ) );
$before = count( $GLOBALS['fencepost_requests'] );
fencepost_make_preview( $post );
wp_update_post( array( 'ID' => $post, 'post_content' => 'Off.' ) );
fencepost_check( count( $GLOBALS['fencepost_requests'] ) === $before && ! wp_next_scheduled( FENCEPOST_EVENT, array( $post ) ), 'with the setting off, nothing is sent' );
delete_option( 'fencepost' );

// Clean up everything the test made
foreach ( array( (int) get_post_meta( $post, FENCEPOST_META_IMAGE, true ), $featured ) as $att ) {
	if ( $att ) {
		wp_delete_attachment( $att, true );
	}
}
wp_clear_scheduled_hook( FENCEPOST_EVENT, array( $post ) );
wp_delete_post( $post, true );
echo $GLOBALS['fencepost_failures'] ? $GLOBALS['fencepost_failures'] . " failed\n" : "all passed\n";
