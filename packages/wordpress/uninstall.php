<?php
/**
 * Removes the plugin's setting and its notes on pages. The preview images
 * stay in the media library, since pages may still use them.
 *
 * @package FencePost
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

delete_option( 'fencepost' );
foreach ( array( '_fencepost_status', '_fencepost_message', '_fencepost_time', '_fencepost_tries' ) as $fencepost_key ) {
	delete_post_meta_by_key( $fencepost_key );
}
