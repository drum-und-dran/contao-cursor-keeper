<?php

declare(strict_types=1);

namespace Dud\ContaoAceCursorKeeper\EventListener;

use Contao\CoreBundle\Routing\ScopeMatcher;
use Symfony\Component\HttpKernel\Event\RequestEvent;

/**
 * Adds remember-ace.js to the backend on the Contao files source editor page only.
 */
final class AddBackendAssetsListener
{
    public function __construct(private readonly ScopeMatcher $scopeMatcher)
    {
    }

    public function __invoke(RequestEvent $event): void
    {
        if (!$event->isMainRequest()) {
            return;
        }

        $request = $event->getRequest();

        // Only backend requests
        if (!$this->scopeMatcher->isBackendRequest($request)) {
            return;
        }

        // Only on "Files" + "source" editor
        if ($request->query->get('do') !== 'files' || $request->query->get('act') !== 'source') {
            return;
        }

        // Contao expects paths relative to the web root.
        // "|static" prevents the framework from rewriting/combining the file.
        $GLOBALS['TL_JAVASCRIPT'][] = 'bundles/dudcontaoacecursorkeeper/remember-ace.js|static';
    }
}
