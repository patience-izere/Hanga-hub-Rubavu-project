import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { authQueryKey } from "@/auth/useAuth";
import { describeApiError } from "@/api/client";
import {
  createPlatformSchool,
  decideRegistration,
  getPlatformOverview,
  deleteContactMessage,
  deletePlatformSchool,
  listContactMessages,
  setContactHandled,
  updatePlatformSchool,
  type PlatformSchool,
  type RegistrationDecision,
} from "@/api/platform";
import { CopyLink } from "@/components/ui/CopyLink";
import { EmptyState } from "@/components/ui/EmptyState";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import "../styles/platform.css";
import "../styles/tables.css";

const overviewKey = ["platform", "schools"] as const;

const KIND_OPTIONS: Array<{ value: PlatformSchool["kind"]; label: string }> = [
  { value: "school", label: "Technical school" },
  { value: "workshop", label: "Garage or workshop" },
  { value: "hub", label: "Training hub" },
];

function CreateSchoolForm() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<PlatformSchool["kind"]>("school");
  const [joinAsAdministrator, setJoinAsAdministrator] = useState(true);
  const [created, setCreated] = useState<PlatformSchool | null>(null);
  const create = useMutation({
    mutationFn: createPlatformSchool,
    onSuccess: async (school) => {
      setCreated(school);
      setName("");
      await queryClient.invalidateQueries({ queryKey: overviewKey });
      // Joining as administrator changes this account's roles and school name.
      await queryClient.invalidateQueries({ queryKey: authQueryKey });
      await queryClient.invalidateQueries({ queryKey: ["school"] });
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (create.isPending) return;
    setCreated(null);
    create.mutate({ name, kind, joinAsAdministrator });
  }

  return (
    <section className="admin-panel">
      <h2>Add an organisation</h2>
      <p className="field-note">
        Classes, courses and invitations belong to an organisation. Add one here, then invite its
        administrators and instructors from <strong>School › Invitations</strong>.
      </p>
      <form onSubmit={submit}>
        <label htmlFor="school-name">Name</label>
        <input
          id="school-name"
          required
          maxLength={180}
          value={name}
          placeholder="e.g. Kigali Technical Secondary School"
          onChange={(event) => setName(event.target.value)}
        />
        <label htmlFor="school-kind">Type</label>
        <select
          id="school-kind"
          value={kind}
          onChange={(event) => setKind(event.target.value as PlatformSchool["kind"])}
        >
          {KIND_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={joinAsAdministrator}
            onChange={(event) => setJoinAsAdministrator(event.target.checked)}
          />
          Make me an administrator of this organisation
        </label>
        {create.isError ? (
          <p className="form-error" role="alert">
            {describeApiError(create.error, "The organisation could not be added.")}
          </p>
        ) : null}
        {created ? (
          <p className="form-success" role="status">
            {created.name} was added.
          </p>
        ) : null}
        <button className="button button-primary" disabled={create.isPending}>
          {create.isPending ? "Adding…" : "Add organisation"}
        </button>
      </form>
    </section>
  );
}

function RequestList({
  requests,
  emailConfigured,
}: {
  requests: NonNullable<ReturnType<typeof useOverview>["data"]>["requests"];
  emailConfigured: boolean;
}) {
  const queryClient = useQueryClient();
  const [result, setResult] = useState<RegistrationDecision | null>(null);
  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: number; decision: "approve" | "decline" }) =>
      decideRegistration(id, decision),
    onSuccess: async (data) => {
      setResult(data);
      await queryClient.invalidateQueries({ queryKey: overviewKey });
    },
  });

  return (
    <section className="admin-panel">
      <h2>Requests to join</h2>
      {result?.acceptUrl ? (
        <div className="form-success" role="status">
          <p>
            {result.school?.name} was created.{" "}
            {result.emailSent
              ? `An invitation was emailed to ${result.request.email}.`
              : `Email is not set up, so send ${result.request.email} this link yourself. It works once, for seven days:`}
          </p>
          {result.emailSent ? null : <CopyLink url={result.acceptUrl} />}
        </div>
      ) : result ? (
        <p className="form-success" role="status">
          The request from {result.request.organisationName} was declined.
        </p>
      ) : null}
      {decide.isError ? (
        <p className="form-error" role="alert">
          {describeApiError(decide.error, "The decision could not be saved.")}
        </p>
      ) : null}
      {requests.length === 0 ? (
        <EmptyState
          title="No requests waiting"
          description="Organisations ask to join from the public “Register your school” page. Their requests appear here."
        />
      ) : (
        <ul className="registration-list">
          {requests.map((request) => (
            <li key={request.id}>
              <div>
                <strong>{request.organisationName}</strong>
                <small>
                  {request.kindLabel}
                  {request.district ? ` · ${request.district}` : ""} · asked{" "}
                  {new Date(request.createdAt).toLocaleDateString()}
                </small>
                <p>
                  {request.contactName} · {request.email}
                  {request.phone ? ` · ${request.phone}` : ""}
                </p>
                {request.message ? <p className="field-note">“{request.message}”</p> : null}
              </div>
              <div className="button-row">
                <button
                  type="button"
                  className="button button-primary"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ id: request.id, decision: "approve" })}
                >
                  Approve and invite
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ id: request.id, decision: "decline" })}
                >
                  Decline
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {!emailConfigured && requests.length > 0 ? (
        <p className="field-note">
          Email is not set up, so approving shows a link to send the contact yourself.
        </p>
      ) : null}
    </section>
  );
}

function ContactInbox() {
  const queryClient = useQueryClient();
  const messages = useQuery({ queryKey: ["platform", "contact"], queryFn: listContactMessages });
  const mark = useMutation({
    mutationFn: ({ id, handled }: { id: number; handled: boolean }) =>
      setContactHandled(id, handled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["platform", "contact"] }),
  });
  const remove = useMutation({
    mutationFn: deleteContactMessage,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["platform", "contact"] }),
  });
  return (
    <section className="admin-panel">
      <h2>Messages from the contact form</h2>
      <QueryBoundary
        query={messages}
        loading="Loading messages…"
        empty={{
          title: "No messages yet",
          description: "Enquiries sent from the public Contact page appear here.",
        }}
      >
        {(items) => (
          <ul className="registration-list">
            {items.map((item) => (
              <li key={item.id} className={item.handled ? "is-handled" : undefined}>
                <div>
                  <strong>
                    {item.name} · {item.topicLabel}
                  </strong>
                  <small>
                    <a href={`mailto:${item.email}`}>{item.email}</a>
                    {item.organisation ? ` · ${item.organisation}` : ""} ·{" "}
                    {new Date(item.createdAt).toLocaleString()}
                  </small>
                  <p className="contact-message-body">{item.message}</p>
                </div>
                <div className="button-row">
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={mark.isPending}
                    onClick={() => mark.mutate({ id: item.id, handled: !item.handled })}
                  >
                    {item.handled ? "Mark as not answered" : "Mark as answered"}
                  </button>
                  <button
                    type="button"
                    className="button-link danger-link"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (window.confirm(`Delete the message from ${item.name}?`)) {
                        remove.mutate(item.id);
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </QueryBoundary>
    </section>
  );
}

function SchoolActions({ school }: { school: PlatformSchool }) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: overviewKey });
  const update = useMutation({
    mutationFn: (changes: Parameters<typeof updatePlatformSchool>[1]) =>
      updatePlatformSchool(school.id, changes),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: () => deletePlatformSchool(school.id),
    onSuccess: refresh,
  });
  const error = update.error ?? remove.error;
  return (
    <div className="crud-actions">
      <button
        type="button"
        className="button-link"
        disabled={update.isPending}
        onClick={() => {
          const name = window.prompt("New name for this organisation", school.name);
          if (name && name.trim() && name.trim() !== school.name)
            update.mutate({ name: name.trim() });
        }}
      >
        Rename
      </button>
      <label>
        <span className="sr-only">Type of {school.name}</span>
        <select
          value={school.kind}
          disabled={update.isPending}
          onChange={(event) =>
            update.mutate({ kind: event.target.value as PlatformSchool["kind"] })
          }
        >
          {KIND_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {school.isOpen ? null : (
        <button
          type="button"
          className="button-link"
          disabled={update.isPending}
          onClick={() => update.mutate({ isActive: !school.isActive })}
        >
          {school.isActive ? "Switch off" : "Switch on"}
        </button>
      )}
      <button
        type="button"
        className="button-link"
        disabled={update.isPending}
        title="Shows pilot study and survey tools to this organisation"
        onClick={() => update.mutate({ researchEnabled: !school.researchEnabled })}
      >
        {school.researchEnabled ? "End research study" : "Start research study"}
      </button>
      {school.isOpen ? null : (
        <button
          type="button"
          className="button-link danger-link"
          disabled={remove.isPending}
          onClick={() => {
            if (
              window.confirm(`Delete ${school.name}? Only an empty organisation can be deleted.`)
            ) {
              remove.mutate();
            }
          }}
        >
          Delete
        </button>
      )}
      {error ? (
        <p className="form-error" role="alert">
          {describeApiError(error, "The change could not be saved.")}
        </p>
      ) : null}
    </div>
  );
}

function useOverview() {
  return useQuery({ queryKey: overviewKey, queryFn: getPlatformOverview });
}

export function PlatformSchoolsPage() {
  const overview = useOverview();
  return (
    <section className="dashboard school-admin">
      <header className="workspace-page-header">
        <span className="eyebrow">Platform</span>
        <h1>Organisations</h1>
        <p>Every school, garage and training hub on OPedu, and requests from new ones.</p>
      </header>
      <QueryBoundary query={overview} loading="Loading organisations…">
        {(data) => (
          <>
            {!data.emailConfigured ? (
              <p className="notice-banner" role="note">
                <strong>Email is not set up.</strong> Invitations and password resets are not sent;
                OPedu shows each link so you can share it yourself. Set the DJANGO_EMAIL_HOST
                settings on the server to send them automatically.
              </p>
            ) : null}
            <div className="admin-grid">
              <CreateSchoolForm />
              <RequestList requests={data.requests} emailConfigured={data.emailConfigured} />
            </div>
            <section className="admin-panel">
              <h2>All organisations ({data.schools.length})</h2>
              {data.schools.length === 0 ? (
                <EmptyState
                  title="No organisations yet"
                  description="Add the first one with the form above."
                />
              ) : (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th scope="col">Name</th>
                        <th scope="col">Type</th>
                        <th scope="col">Members</th>
                        <th scope="col">Administrators</th>
                        <th scope="col">Status</th>
                        <th scope="col">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.schools.map((school) => (
                        <tr key={school.id}>
                          <th scope="row">
                            {school.name}
                            {school.isOpen ? <small> · open class for self sign-up</small> : null}
                          </th>
                          <td>{school.kindLabel}</td>
                          <td>{school.memberCount}</td>
                          <td>{school.adminCount}</td>
                          <td>{school.isActive ? "Active" : "Switched off"}</td>
                          <td>
                            <SchoolActions school={school} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <ContactInbox />
          </>
        )}
      </QueryBoundary>
    </section>
  );
}
