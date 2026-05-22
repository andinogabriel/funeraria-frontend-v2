import { CdkDrag } from '@angular/cdk/drag-drop';
import { Directive, inject, OnInit } from '@angular/core';

/**
 * Sets up a {@link CdkDrag} on the dialog root so the operator can reposition
 * the modal by dragging its header strip (rendered by
 * {@link DialogHeaderComponent}).
 *
 * <h3>Why a directive and not inline cdkDrag attributes</h3>
 *
 * Every dialog repeats the same three drag-related strings —
 * `cdkDragRootElement=".cdk-overlay-pane"` and
 * `cdkDragBoundary=".cdk-overlay-container"`. Centralising those in this
 * directive lets us:
 *
 * <ul>
 *   <li>tweak the drag boundary in exactly one place if we ever want to
 *       confine the drag to the viewport instead of the full overlay
 *       container;</li>
 *   <li>guarantee every dialog uses the same selectors — typos in any one
 *       template would silently break drag for that single dialog;</li>
 *   <li>declare the directive once via {@code hostDirectives} on the
 *       individual dialog components rather than as a child element, keeping
 *       the dialog markup short.</li>
 * </ul>
 *
 * <h3>Selectors</h3>
 *
 * <ul>
 *   <li>{@code .cdk-overlay-pane} — the positioned element the CDK assigns
 *       to every overlay (including MatDialog). Picking this as the drag
 *       root means dragging moves the entire dialog, not just its inner
 *       content.</li>
 *   <li>{@code .cdk-overlay-container} — the document-level container that
 *       holds every overlay. Used as the boundary so the dialog stays
 *       inside the visible area; on very narrow viewports the operator
 *       cannot push the title past the edge.</li>
 * </ul>
 */
@Directive({
  selector: '[appDraggableDialog]',
  hostDirectives: [CdkDrag],
})
export class DraggableDialogDirective implements OnInit {
  private readonly drag = inject(CdkDrag);

  ngOnInit(): void {
    this.drag.rootElementSelector = '.cdk-overlay-pane';
    this.drag.boundaryElement = '.cdk-overlay-container';
  }
}
