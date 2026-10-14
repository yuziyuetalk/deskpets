#import <AppKit/AppKit.h>

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    if (argc != 2) {
      fprintf(stderr, "Missing wallpaper path\n");
      return 1;
    }

    NSString *imagePath = [NSString stringWithUTF8String:argv[1]];
    NSURL *imageURL = [NSURL fileURLWithPath:imagePath];
    if (![[NSFileManager defaultManager] fileExistsAtPath:imagePath]) {
      fprintf(stderr, "Wallpaper file does not exist\n");
      return 1;
    }

    NSWorkspace *workspace = [NSWorkspace sharedWorkspace];
    for (NSScreen *display in [NSScreen screens]) {
      NSError *error = nil;
      NSDictionary *options = [workspace desktopImageOptionsForScreen:display] ?: @{};
      if (![workspace setDesktopImageURL:imageURL forScreen:display options:options error:&error]) {
        fprintf(stderr, "%s\n", error.localizedDescription.UTF8String ?: "Unknown wallpaper error");
        return 1;
      }
    }
  }
  return 0;
}
