package expo.modules.councilaudio

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** JS bridge for the council foreground service (see CouncilAudioService). */
class CouncilAudioModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CouncilAudio")

    Events("onLeave", "onInterruption")

    OnCreate {
      CouncilAudioService.leaveListener = { councilId, reason ->
        sendEvent("onLeave", mapOf("councilId" to councilId, "reason" to reason))
      }
    }

    OnDestroy {
      CouncilAudioService.leaveListener = null
    }

    Function("sync") { councilId: String, title: String, text: String, onStage: Boolean, url: String ->
      val context = appContext.reactContext ?: return@Function false
      CouncilAudioService.sync(
        context,
        CouncilAudioService.Session(councilId, title, text, onStage, url)
      )
    }

    Function("stop") {
      appContext.reactContext?.let { CouncilAudioService.stop(it) }
      true
    }

    Function("isMicCaptureAllowed") {
      CouncilAudioService.micCaptureAllowed()
    }
  }
}
