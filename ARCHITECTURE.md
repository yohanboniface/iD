## d3

[d3](http://d3js.org/) is the primary library used by iD. It is used for
rendering the map data as well as many sorts of general DOM manipulation tasks
for which jQuery would often be used.

Notable features of d3 that are used by iD include
[d3.xhr](https://github.com/mbostock/d3/wiki/Requests#wiki-d3_xhr), which is
used to make the API requests to download data from openstreetmap.org and save
changes;
[d3.dispatch](https://github.com/mbostock/d3/wiki/Internals#wiki-d3_dispatch),
which provides a callback-based [Observer
pattern](http://en.wikipedia.org/wiki/Observer_pattern) between different
parts of iD;
[d3.geo.path](https://github.com/mbostock/d3/wiki/Geo-Paths#wiki-path), which
generates SVG paths for lines and areas; and
[d3.behavior.zoom](https://github.com/mbostock/d3/wiki/Zoom-Behavior#wiki-zoom),
which implements map panning and zooming.

## Core

The iD *core* implements the OSM data types, a graph of OSM object's
relationships to each other, and an undo/redo history for changes made during
editing. It aims to be generic enough to be used by other JavaScript-based
tools for OpenStreetMap.

Briefly, the OSM data model includes three basic data types: nodes, ways, and
relations. A _node_ is a point type, having a single geographic coordinate. A
_way_ is an ordered list of nodes. And a _relation_ groups together nodes,
ways, and other relations to provide free-form higher-level structures. Each
of these three types has _tags_: an associative array of key-value pairs which
describe the object.

In iD, these three types are implemented by `iD.Node`, `iD.Way` and
`iD.Relation`. These three classes inherit from a common base, `iD.Entity`
(the only use of classical inheritance in iD). Generically, we refer to a
node, way or relation as an _entity_.

Every entity has an _ID_ either assigned by the OSM database, or, for an
entity that is newly created, constructed as a proxy consisting of a negative
numeral. IDs from the OSM database as treated as opaque strings; no
[assumptions](http://lists.openstreetmap.org/pipermail/dev/2013-February/026495.html)
are made of them other than that they can be compared for identity and do not
begin with a minus sign (and thus will not conflict with proxy IDs). In fact,
in the OSM database the three types of entities have separate ID spaces; a
node can have the same ID as a way, for instance. Because it is useful to
store heterogeneous entities in the same datastructure, iD ensures that every
entity has a fully-unique ID by prefixing each OSM ID with the first letter of
the entity type. For example, a way with OSM ID 123456 is represented as
'w123456' within iD.

iD entities are *immutable*: once constructed, an `Entity` object cannot
change. Tags cannot be updated; nodes cannot be added or removed from ways,
and so on. Immutability makes it easier to reason about the behavior of an
entity: if your code has a reference to one, it is safe to store it and use it
later, knowing that it cannot have been changed outside of your control. It
also makes it possible to implement the entity graph (described below) as an
efficient [persistent data
structure](http://en.wikipedia.org/wiki/Persistent_data_structure). But
obviously, iD is an editor, and must allow entities to change somehow. The
solution is that all edits produce new copies of anything that changes. At the
entity level, this takes the form of methods such as `iD.Node#move`, which
returns a new node object that has the same ID and tags as the original, but a
different coordinate. More generically, `iD.Entity#update` returns a new
entity of the same type and ID as the original but with specified properties
such as `nodes`, `tags`, or `members` replaced.

Entities are related to one another: ways have many nodes and relations have
many members. In order to render a map of a certain area, iD needs a
datastructure to hold all the entities in that area and traverse these
relationships. `iD.Graph` provides this functionality. The core of a graph is
a map between IDs and the associated entities; given an ID, the graph can give
you the entity. Like entities, a graph is immutable: adding, replacing, or
removing an entity produces a new graph, and the original is unchanged.
Because entities are immutable, the original and new graphs can share
references to entities that have not changed, keeping memory use to a minimum.
If you are familiar with how git works internally, this persistent data
structure approach is very similar.

The final component of the core is comprised of `iD.History` and
`iD.Difference`, which track the changes made in an editing session and
provide undo/redo capabilities. Here, the immutable nature of the core types
really pays off: the history is a simple stack of graphs, each representing
the state of the data at a particular point in editing. The graph at the top
of the stack is the current state, off which all rendering is based. To undo
the last change, this graph is popped off the stack, and the map is
re-rendered based on the new top of the stack. Contrast this to a mutable
graph as used in JOSM and Potlatch: every command that changes the graph must
implement an equal and opposite undo command that restores the graph to the
previous state.

## Actions

In iD, an _action_ is a function that accepts a graph as input and returns a
modified graph as output. Actions typically need other inputs as well; for
example, `iD.actions.DeleteNode` also requires the ID of a node to delete. The
additional input is passed to the action's constructor:

``` var action = iD.actions.DeleteNode('n123456'); // construct the action var
newGraph = action(oldGraph); // apply the action ```

iD provides actions for all the typical things an editor needs to do: add a
new entity, split a way in two, connect the vertices of two ways together, and
so on. In addition to performing the basic work needed to accomplish these
things, an action typically contains a significant amount of logic for keeping
the relationships between entities logical and consistent. For example, an
action as apparently simple as `DeleteNode`, in addition to removing the node
from the graph, needs to do two other things: remove the node from any ways in
which it is a member (which in turn requires deleting parent ways that are
left with just a single node), and removing it from any relations of which it
is a member.

As you can imagine, implementing all these details requires an expert
knowledge of the OpenStreetMap data model. It is our hope that JavaScript
based tools for OpenStreetMap can reuse the implementations provided by iD in
other contexts, significantly reducing the work necessary to create a robust
tool.

## Modes

With _modes_, we shift gears from abstract data types and algorithms to the
parts of the architecture that implement the user interface for iD. Modes are
manifested in the interface by the four buttons at the top left:

![Mode buttons](img/modes.png)

The modality of existing OSM editors runs the gamut from Potlatch 2, which is
almost entirely modeless, to JOSM, which sports half a dozen modes out of the
box and has many more provided by plugins. iD seeks a middle ground: too few
modes can leave new users unsure where to start, while too many can be
overwhelming.

iD's user-facing modes consist of a base "Browse" mode, in which you can move
around the map and select and edit entities, and three geometrically-oriented
drawing modes: Point, Line, and Area. In the code, these are broken down a
little bit more. There are separate modes for when an entity is selected
(`iD.modes.Select`) versus when nothing is selected (`iD.modes.Browse`), and
each of the geometric modes is split into one mode for starting to draw an
object and one mode for continuing an existing object (with the exception of
`iD.modes.AddPoint`, which is a single-step operation for obvious reasons).

The code interface for each mode consists of a pair of methods: `enter` and
`exit`. In the `enter` method, a mode sets up all the behavior that should be
present when that mode is active. This typically means binding callbacks to
DOM events that will be triggered on map elements, installing keybindings, and
showing certain parts of the interface like the inspector in `Select` mode.
The `exit` mode does the opposite, removing the behavior installed by the
`enter` method. Together the two methods ensure that modes are self-contained
and exclusive: each mode knows exactly the behavior that is specific to that
mode, and exactly one mode's behavior is active at any time.

## Behavior

Certain behaviors are common to more than one mode. For example, iD indicates
interactive map elements by drawing a halo around them when you hover over
them, and this behavior is common to both the browse and draw modes. Instead
of duplicating the code to implement this behavior in all these modes, we
extract it to `iD.behavior.Hover`.

_Behaviors_ take their inspiration from [d3's
behaviors](https://github.com/mbostock/d3/wiki/Behaviors). Like d3's `zoom`
and `drag`, each iD behavior is a function that takes as input a d3 selection
(assumed to consist of a single element) and installs the DOM event bindings
necessary to implement the behavior. The `Hover` behavior, for example,
installs bindings for the `mouseover` and `mouseout` events that add and
remove a `hover` class from map elements.

Because certain behaviors are appropriate to some but not all modes, we need
the ability to remove a behavior when entering a mode where it is not
appropriate. (This is functionality [not yet
provided](https://github.com/mbostock/d3/issues/894) by d3's own behaviors.)
Each behavior implements an `off` function that "uninstalls" the behavior.
This is very similar to the `exit` method of a mode, and in fact many modes do
little else but uninstall behaviors in their `exit` methods.

## Operations

_Operations_ wrap actions, providing their user-interface: tooltips, key
bindings, and the logic that determines whether an action can be validly
performed given the current map state and selection. Each operation is
constructed with the list of IDs which are currently selected and a `context`
object which provides access to the history and other important parts of iD's
internal state. After being constructed, an operation can be queried as to
whether or not it should be made available (i.e., show up in the context menu)
and if so, if it should be enabled.

![Operations menu](img/operations.png)

We make a distinction between availability and enabled state for the sake of
learnability: most operations are available so long as an entity of the
appropriate type is selected. Even if it remains disabled for other reasons
(e.g. because you can't split a way on its start or end vertex), a new user
can still learn that "this is something I can do to this type of thing", and a
tooltip can provide an explanation of what that operation does and the
conditions under which it is enabled.

To execute an operation, call it as a function, with no arguments. The typical
operation will perform the appropriate action, creating a new undo state in
the history, and then enter the appropriate mode. For example,
`iD.operations.Split` performs `iD.actions.Split`, then enters
`iD.modes.Select` with the resulting ways selected.

## Rendering and other UI
