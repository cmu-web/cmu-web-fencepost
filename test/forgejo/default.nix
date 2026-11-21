# FencePost's action on a Forgejo runner, in a NixOS VM: Forgejo, its runner
# with Docker, and a repository whose workflow serves a page on 127.0.0.1
# inside the job container and runs the action on it. The job checks the
# preview image itself; the test waits for the run to succeed.
#
# The container image under test comes from outside Nix, as a docker save
# tarball, since it's built by the Dockerfile. run.sh builds it and runs this.
{
  fencepostImage,
  # A pinned nixpkgs, so the VM test runs the same Forgejo and runner every time
  nixpkgs ? builtins.fetchTarball {
    url = "https://github.com/NixOS/nixpkgs/archive/f68407657ad294471eb4b2e65d193df26edf729f.tar.gz";
    sha256 = "sha256-E+XLAfnC7+bdr4qlEgRv6cdGmiqTU5oeFNKCha7epqQ=";
  },
}:
let
  pkgs = import nixpkgs { system = "x86_64-linux"; };
  # What the job runs in: a shell, Docker's command line and a web server
  jobImage = pkgs.dockerTools.buildLayeredImage {
    name = "fp-job";
    tag = "latest";
    contents = with pkgs; [
      bashInteractive
      coreutils
      curl
      docker-client
      file
      findutils
      gnugrep
      gnused
      python3Minimal
      util-linux
      dockerTools.binSh
      dockerTools.usrBinEnv
      dockerTools.fakeNss
      dockerTools.caCertificates
    ];
    extraCommands = "mkdir -p tmp && chmod 1777 tmp";
    config.Env = [ "PATH=/bin:/usr/bin" ];
  };
  # The action as a repository on the Forgejo server: action.yml only
  action = pkgs.runCommand "fencepost-action" { } ''
    mkdir $out
    cp ${../../action.yml} $out/action.yml
  '';
  workflow = pkgs.writeText "preview.yml" ''
    on: [push]
    jobs:
      preview:
        runs-on: fp
        steps:
          - name: Serve a page
            run: |
              mkdir -p _site
              printf '<!doctype html><title>Andrew Carnegie</title><body style="background:#c41230;color:#fff"><h1>Andrew Carnegie</h1></body>' > _site/index.html
              setsid python3 -m http.server 4000 --bind 127.0.0.1 --directory _site </dev/null >/dev/null 2>&1 &
              until curl -fs http://127.0.0.1:4000/ >/dev/null; do sleep 1; done
          - id: fp
            uses: http://localhost:3000/ac00/fencepost@main
            with:
              url: http://127.0.0.1:4000/
              preview: _site/images/preview.jpg
              public-url: https://www.cmu.edu/example/
              container-image: fencepost:forgejo-test
          - name: Check the preview image
            run: |
              set -x
              file _site/images/preview.jpg | grep -q 'JPEG image data.*1200x630'
              size=$(stat -c %s _site/images/preview.jpg)
              test "$size" -le 300000
              test "''${{ steps.fp.outputs.title }}" = "Andrew Carnegie"
              test "''${{ steps.fp.outputs.preview }}" = "_site/images/preview.jpg"
              echo "FENCEPOST-OK size=$size job=$JOB_CONTAINER_NAME"
  '';
in
pkgs.testers.runNixOSTest {
  name = "fencepost-forgejo-action";
  nodes.server =
    { config, pkgs, ... }:
    {
      virtualisation = {
        memorySize = 4096;
        cores = 4;
        diskSize = 8192;
        docker.enable = true;
      };
      services.forgejo = {
        enable = true;
        settings.service.DISABLE_REGISTRATION = true;
        settings.actions.ENABLED = true;
      };
      environment.systemPackages = [
        config.services.forgejo.package
        pkgs.git
        pkgs.jq
        pkgs.curl
      ];
      specialisation.runner = {
        inheritParentConfig = true;
        configuration.services.gitea-actions-runner = {
          package = pkgs.forgejo-runner;
          instances.test = {
            enable = true;
            name = "ci";
            url = "http://localhost:3000";
            labels = [ "fp:docker://fp-job:latest" ];
            tokenFile = "/var/lib/forgejo/runner_token";
            # The job gets the Docker socket, as the action requires
            settings.container.docker_host = "automount";
          };
        };
      };
    };
  testScript =
    { nodes, ... }:
    ''
      import json

      server.wait_for_unit("forgejo.service")
      server.wait_for_open_port(3000)
      server.wait_for_unit("docker.service")
      server.succeed("docker load < ${fencepostImage}")
      server.succeed("docker load < ${jobImage}")

      server.succeed(
          "su -l forgejo -c 'GITEA_WORK_DIR=/var/lib/forgejo forgejo admin user create "
          + "--username ac00 --password carnegie-1835 --email ac00@localhost --must-change-password=false'"
      )
      token = server.succeed(
          "curl --fail -X POST http://ac00:carnegie-1835@localhost:3000/api/v1/users/ac00/tokens "
          + "-H 'Content-Type: application/json' -d '{\"name\":\"t\",\"scopes\":[\"all\"]}' | jq -r .sha1"
      ).strip()
      for repo in ["fencepost", "site"]:
          server.succeed(
              "curl --fail -X POST http://localhost:3000/api/v1/user/repos "
              + f"-H 'Content-Type: application/json' -H 'Authorization: token {token}' "
              + f"-d '{{\"name\":\"{repo}\",\"private\":false}}'"
          )
      server.succeed(
          "curl --fail -X PATCH http://localhost:3000/api/v1/repos/ac00/site "
          + f"-H 'Content-Type: application/json' -H 'Authorization: token {token}' "
          + "-d '{\"has_actions\":true}'"
      )

      server.succeed(
          "su -l forgejo -c 'GITEA_WORK_DIR=/var/lib/forgejo forgejo actions generate-runner-token' "
          + "| sed 's/^/TOKEN=/' > /var/lib/forgejo/runner_token"
      )
      server.succeed("${nodes.server.system.build.toplevel}/specialisation/runner/bin/switch-to-configuration test")
      server.wait_for_unit("gitea-runner-test.service")
      server.wait_until_succeeds("journalctl -o cat -u gitea-runner-test.service | grep -q 'Runner registered successfully'")

      git = "git -c user.name='Andrew Carnegie' -c user.email=ac00@localhost -c init.defaultBranch=main"
      remote = "http://ac00:carnegie-1835@localhost:3000/ac00"
      server.succeed(
          f"cp -r ${action} /tmp/fencepost && chmod -R u+w /tmp/fencepost && cd /tmp/fencepost && {git} init "
          + f"&& {git} add . && {git} commit -m action && {git} push {remote}/fencepost.git main"
      )
      server.succeed(
          "mkdir -p /tmp/site/.forgejo/workflows && cp ${workflow} /tmp/site/.forgejo/workflows/preview.yml "
          + f"&& cd /tmp/site && {git} init && {git} add . && {git} commit -m site && {git} push {remote}/site.git main"
      )

      def logs():
          return server.execute(
              "curl -s http://localhost:3000/ac00/site/actions/runs/1/jobs/0/attempt/1/logs; "
              + "journalctl -o cat -u gitea-runner-test.service | tail -40"
          )[1]

      def done(_) -> bool:
          runs = json.loads(server.succeed("curl --fail -s http://localhost:3000/api/v1/repos/ac00/site/actions/tasks")).get("workflow_runs") or []
          status = runs[0].get("status") if runs else "waiting"
          server.log(f"Workflow status: {status}")
          if status == "failure":
              print(logs())
              raise Exception("The workflow failed")
          return status == "success"

      with server.nested("Waiting for the workflow to succeed"):
          retry(done, 900)
      log = logs()
      print(log)
      assert "FENCEPOST-OK" in log, "the job's check didn't print its marker"
      assert "FencePost: in job container" in log, "the action didn't join the job container"
    '';
}
