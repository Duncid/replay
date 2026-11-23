export type SceneReadiness = "loading" | "ready" | "error";

/** A practice view owns one lease. Old renderer callbacks cannot ready a new lesson. */
export class PracticeSceneReadiness {
  private current?: { status: SceneReadiness; revision: number };
  get attached() { return !!this.current; }
  attach() {
    const scene = { status: "loading" as SceneReadiness, revision: 0 };
    this.current = scene;
    return {
      setStatus: (status: SceneReadiness) => {
        if (this.current !== scene) return;
        scene.status = status; scene.revision++;
      },
      dispose: () => { if (this.current === scene) this.current = undefined; },
    };
  }
  async wait(cancelled: () => boolean, delay = 1000) {
    const scene = this.current;
    if (!scene) return true;
    let since: number | undefined, revision = scene.revision;
    while (!cancelled() && this.current === scene && scene.status !== "error") {
      if (scene.status !== "ready" || revision !== scene.revision || document.visibilityState === "hidden") {
        since = undefined; revision = scene.revision;
      } else {
        since ??= performance.now();
        if (performance.now() - since >= delay) return true;
      }
      await new Promise(resolve => setTimeout(resolve, 16));
    }
    return false;
  }
}
export const practiceSceneReadiness = new PracticeSceneReadiness();
